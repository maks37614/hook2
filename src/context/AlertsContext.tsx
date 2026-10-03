import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import { PriceAlert, AlertHistoryItem } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { cleanForFirestore } from '../lib/firestoreUtils';
import { playAlertChime } from '../utils/domSound';
import { getAlertMirrorWrites, getAlertMirrorDeletes } from '../utils/alertSync';

interface AlertsContextType {
  alerts: PriceAlert[];
  history: AlertHistoryItem[];
  loading: boolean;
  loadingHistory: boolean;
  notificationPermission: NotificationPermission;
  requestNotificationPermission: () => Promise<NotificationPermission>;
  addAlert: (
    data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
  ) => Promise<PriceAlert>;
  addAlertsBatch: (
    items: Array<
      Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
    >
  ) => Promise<PriceAlert[]>;
  deleteAlert: (id: string) => Promise<boolean>;
  toggleAlert: (id: string) => Promise<void>;
  clearTriggered: () => Promise<number>;
  fetchHistory: () => Promise<void>;
  clearHistory: () => Promise<number>;
  deleteHistoryItem: (id: string) => Promise<boolean>;
  reactivateAlert: (item: AlertHistoryItem | PriceAlert) => Promise<PriceAlert>;
  activeAlertsCount: number;
  triggeredAlertsCount: number;
  historyCount: number;
}

const AlertsContext = createContext<AlertsContextType | undefined>(undefined);

export const AlertsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, profile } = useAuth();
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [history, setHistory] = useState<AlertHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  const notifiedTriggers = useRef(new Set<string>());
  const firestoreAlertsRef = useRef<PriceAlert[]>([]);
  const pendingMirrors = useRef(new Set<string>());
  useEffect(() => {
    notifiedTriggers.current.clear();
    firestoreAlertsRef.current = [];
    pendingMirrors.current.clear();
  }, [user?.uid]);

  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;
  const userRef = useRef(user);
  userRef.current = user;
  const profileRef = useRef(profile);
  profileRef.current = profile;

  const mirrorServerAlerts = useCallback((userId: string, serverAlerts: PriceAlert[], syncedAlerts: PriceAlert[] = []) => {
    if (userRef.current?.uid !== userId) return;
    // Delete only documents sent in this request; a newer snapshot may contain
    // an alert created while the response was in flight.
    for (const id of getAlertMirrorDeletes(serverAlerts, syncedAlerts)) {
      const key = `${userId}:${id}`;
      if (pendingMirrors.current.has(key)) continue;
      pendingMirrors.current.add(key);
      deleteDoc(doc(db, 'users', userId, 'alerts', id))
        .catch(() => {})
        .finally(() => pendingMirrors.current.delete(key));
    }
    for (const alert of getAlertMirrorWrites(serverAlerts, firestoreAlertsRef.current)) {
      const key = `${userId}:${alert.id}`;
      if (pendingMirrors.current.has(key)) continue;
      pendingMirrors.current.add(key);
      setDoc(doc(db, 'users', userId, 'alerts', alert.id), cleanForFirestore(alert))
        .catch(() => {})
        .finally(() => pendingMirrors.current.delete(key));
    }
  }, []);

  const requestNotificationPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        setNotificationPermission(perm);
        return perm;
      } catch {
        return 'denied';
      }
    }
    return 'denied';
  }, []);

  const handleServerAlertTriggered = useCallback((serverAlert: PriceAlert) => {
    const key = `${serverAlert.id}:${serverAlert.triggeredAt ?? 0}`;
    if (notifiedTriggers.current.has(key)) return;
    notifiedTriggers.current.add(key);
    playAlertChime();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('signalhook:alert-triggered', {
          detail: {
            symbol: serverAlert.symbol,
            targetPrice: serverAlert.targetPrice,
            condition: serverAlert.condition,
            triggeredPrice: serverAlert.triggeredPrice,
            message: serverAlert.note || serverAlert.formationName || 'Цільову ціну досягнуто!',
          },
        })
      );

      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          const conditionSign = serverAlert.condition === 'gte' ? '≥' : '≤';
          new Notification(`🚨 SIGNALHOOK: ${serverAlert.symbol}`, {
            body: `Ціна: $${serverAlert.triggeredPrice} ${conditionSign} Ціль: $${serverAlert.targetPrice}\n${serverAlert.note || serverAlert.formationName || 'Ціль досягнута!'}`,
            icon: '/favicon.ico',
          });
        } catch {
          // ignore
        }
      }
    }
  }, []);

  // Fetch notification history from server & Firestore
  const fetchHistory = useCallback(async () => {
    if (!user) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      // 1. Fetch from server endpoint (stores all alerts triggered even when site was closed)
      const res = await fetch(`/api/alerts/history?userId=${encodeURIComponent(user.uid)}`);
      let serverItems: AlertHistoryItem[] = [];
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.history)) {
          serverItems = data.history;
        }
      }

      // 2. If Firebase user, also merge with Firestore history
      const isFirebase = Boolean(user && !(user as any).isLocalUser);
      let firestoreItems: AlertHistoryItem[] = [];
      if (isFirebase) {
        try {
          const histColRef = collection(db, 'users', user.uid, 'history');
          const q = query(histColRef, orderBy('triggeredAt', 'desc'));
          const snap = await getDocs(q);
          snap.forEach((d) => {
            firestoreItems.push(d.data() as AlertHistoryItem);
          });
        } catch {
          // Firestore optional
        }
      }

      // Combine and deduplicate by id
      const combinedMap = new Map<string, AlertHistoryItem>();
      serverItems.forEach((item) => combinedMap.set(item.id, item));
      firestoreItems.forEach((item) => {
        if (!combinedMap.has(item.id)) {
          combinedMap.set(item.id, item);
        }
      });

      const sorted = Array.from(combinedMap.values()).sort((a, b) => b.triggeredAt - a.triggeredAt);
      if (userRef.current?.uid !== user.uid) return;
      setHistory(sorted);

      // Backfill server items to Firestore if needed
      if (isFirebase && serverItems.length > 0) {
        const batch = writeBatch(db);
        let batchCount = 0;
        const existingSet = new Set(firestoreItems.map((f) => f.id));
        for (const item of serverItems) {
          if (!existingSet.has(item.id) && batchCount < 20) {
            const docRef = doc(db, 'users', user.uid, 'history', item.id);
            batch.set(docRef, cleanForFirestore(item));
            batchCount++;
          }
        }
        if (batchCount > 0) {
          batch.commit().catch(() => {});
        }
      }
    } catch (err) {
      console.error('Failed to fetch alert history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.uid]);

  const fetchHistoryRef = useRef(fetchHistory);
  fetchHistoryRef.current = fetchHistory;
  const handleServerAlertTriggeredRef = useRef(handleServerAlertTriggered);
  handleServerAlertTriggeredRef.current = handleServerAlertTriggered;

  // Sync with Firestore or local storage depending on whether user is Firebase or local
  useEffect(() => {
    if (!user) {
      setAlerts([]);
      setHistory([]);
      setLoading(false);
      return;
    }

    const isLocal = Boolean((user as any).isLocalUser);

    if (isLocal) {
      try {
        const saved = localStorage.getItem(`signalhook_user_alerts_${user.uid}`);
        const list: PriceAlert[] = saved ? JSON.parse(saved) : [];
        setAlerts(list);
        setLoading(false);

        // Sync with backend monitor and obtain merged state
        fetch('/api/alerts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            telegramBotToken: profile?.telegramBotToken,
            telegramChatId: profile?.telegramChatId,
            alerts: list,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (data.success && Array.isArray(data.alerts)) {
              if (userRef.current?.uid !== user.uid) return;
              data.alerts.forEach((serverAlert: PriceAlert) => {
                const local = list.find(a => a.id === serverAlert.id);
                if (local && !local.triggered && serverAlert.triggered) handleServerAlertTriggeredRef.current(serverAlert);
              });
              alertsRef.current = data.alerts;
              setAlerts(data.alerts);
              try {
                localStorage.setItem(`signalhook_user_alerts_${user.uid}`, JSON.stringify(data.alerts));
              } catch {}
            }
          })
          .catch(() => {});
      } catch {
        setAlerts([]);
        setLoading(false);
      }

      fetchHistory();
      return;
    }

    setLoading(true);
    const alertsColRef = collection(db, 'users', user.uid, 'alerts');
    const q = query(alertsColRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        if (userRef.current?.uid !== user.uid) return;
        const list: PriceAlert[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as PriceAlert);
        });
        firestoreAlertsRef.current = list;
        alertsRef.current = list;
        setAlerts(list);
        setLoading(false);

        // Sync active alerts with backend background monitor so Telegram alerts fire
        fetch('/api/alerts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            telegramBotToken: profile?.telegramBotToken,
            telegramChatId: profile?.telegramChatId,
            alerts: list,
          }),
        })
          .then((r) => r.json())
          .then((data) => {
            if (userRef.current?.uid !== user.uid) return;
            if (data.success && Array.isArray(data.alerts)) {
              data.alerts.forEach((serverAlert: PriceAlert) => {
                const localMatch = list.find((a) => a.id === serverAlert.id);
                if (localMatch && serverAlert.triggered && !localMatch.triggered) {
                  handleServerAlertTriggeredRef.current(serverAlert);
                }
              });
              alertsRef.current = data.alerts;
              setAlerts(data.alerts);
              mirrorServerAlerts(user.uid, data.alerts, list);
            }
          })
          .catch(() => {});
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/alerts`);
        setLoading(false);
      }
    );

    fetchHistory();

    return () => unsubscribe();
  }, [user?.uid, profile?.telegramBotToken, profile?.telegramChatId]);

  // Active client-side CRON polling to sync with server alerts monitor every 5 seconds
  useEffect(() => {
    if (!user?.uid) return;

    let disposed = false;
    let inFlight = false;
    const pollSync = async () => {
      if (inFlight || disposed) return;
      inFlight = true;
      try {
        const currentUser = userRef.current;
        if (!currentUser || currentUser.uid !== user.uid) return;
        const isLocal = Boolean((currentUser as any).isLocalUser);
        let currentAlertsList = alertsRef.current;
        if (isLocal) {
          const saved = localStorage.getItem(`signalhook_user_alerts_${currentUser.uid}`);
          if (saved) {
            try { currentAlertsList = JSON.parse(saved); } catch {}
          }
        }

        const res = await fetch('/api/alerts/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: currentUser.uid,
            telegramBotToken: profileRef.current?.telegramBotToken,
            telegramChatId: profileRef.current?.telegramChatId,
            alerts: currentAlertsList,
          }),
        });

        if (!res.ok) return;
        const data = await res.json();
        if (disposed || userRef.current?.uid !== currentUser.uid) return;
        if (data.success && Array.isArray(data.alerts)) {
          let hasNewlyTriggered = false;

          data.alerts.forEach((serverAlert: PriceAlert) => {
            const localMatch = currentAlertsList.find((a) => a.id === serverAlert.id);
            if (localMatch && serverAlert.triggered && !localMatch.triggered) {
              hasNewlyTriggered = true;
              handleServerAlertTriggeredRef.current(serverAlert);
            }
          });

          alertsRef.current = data.alerts;
          setAlerts((prev) => {
            if (JSON.stringify(prev) === JSON.stringify(data.alerts)) return prev;
            return data.alerts;
          });
          if (isLocal) {
            try {
              localStorage.setItem(`signalhook_user_alerts_${currentUser.uid}`, JSON.stringify(data.alerts));
            } catch {}
          } else {
            mirrorServerAlerts(currentUser.uid, data.alerts, currentAlertsList);
          }

          if (hasNewlyTriggered) {
            fetchHistoryRef.current();
          }
        }
      } catch {
        // Retry on the next poll.
      } finally {
        inFlight = false;
      }
    };

    const interval = setInterval(pollSync, 5000);
    return () => { disposed = true; clearInterval(interval); };
  }, [user?.uid]);

  // Migrate local alerts to user profile on first login if any
  useEffect(() => {
    if (user && !(user as any).isLocalUser) {
      try {
        const raw = localStorage.getItem('signalhook_local_alerts');
        if (raw) {
          const localList: PriceAlert[] = JSON.parse(raw);
          if (Array.isArray(localList) && localList.length > 0) {
            const batch = writeBatch(db);
            localList.forEach((la) => {
              const alertRef = doc(db, 'users', user.uid, 'alerts', la.id);
              batch.set(
                alertRef,
                cleanForFirestore({
                  ...la,
                  userId: user.uid,
                  updatedAt: new Date().toISOString(),
                })
              );
            });
            batch
              .commit()
              .then(() => {
                localStorage.removeItem('signalhook_local_alerts');
              })
              .catch(() => {});
          }
        }
      } catch (e) {
        console.error('Error migrating local alerts:', e);
      }
    }
  }, [user]);

  const addAlert = useCallback(
    async (
      data: Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
    ): Promise<PriceAlert> => {
      if (!user) {
        throw new Error('Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.');
      }

      if (!Number.isFinite(Number(data.targetPrice)) || Number(data.targetPrice) <= 0 ||
          !['gte', 'lte'].includes(data.condition) || !data.symbol.trim()) {
        throw new Error('Вкажіть коректний символ, додатню ціну й умову сповіщення.');
      }
      const alertId = `alert_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const cleanSymbol = data.symbol.toUpperCase().replace('/', '').trim();

      const effectiveBotToken = profile?.telegramBotToken || (typeof window !== 'undefined' ? localStorage.getItem('signalhook_tg_token') || undefined : undefined);
      const effectiveChatId = profile?.telegramChatId || (typeof window !== 'undefined' ? localStorage.getItem('signalhook_tg_chat_id') || undefined : undefined);

      const newAlert: PriceAlert = {
        id: alertId,
        userId: user.uid,
        symbol: cleanSymbol,
        exchange: data.exchange,
        marketType: data.marketType,
        targetPrice: Number(data.targetPrice),
        condition: data.condition,
        note: data.note?.trim() || undefined,
        formationName: data.formationName?.trim() || undefined,
        levelType: data.levelType || 'custom',
        createdAt: Date.now(),
        isActive: data.isActive !== undefined ? data.isActive : true,
        triggered: false,
        telegramBotToken: effectiveBotToken,
        telegramChatId: effectiveChatId,
      };

      const isFirebase = Boolean(user && !(user as any).isLocalUser);

      if (isFirebase && user) {
        // Save to Firestore under user profile subcollection
        try {
          const alertDocRef = doc(db, 'users', user.uid, 'alerts', alertId);
          await setDoc(alertDocRef, cleanForFirestore(newAlert));
        } catch (err) {
          handleFirestoreError(err, OperationType.CREATE, `users/${user.uid}/alerts/${alertId}`);
          throw err;
        }

        // Notify server alert monitor
        fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newAlert,
            userId: user.uid,
          }),
        }).catch(() => {});
      } else {
        // Local registered user fallback
        const storageKey = `signalhook_user_alerts_${user.uid}`;
        setAlerts((prev) => {
          const updated = [newAlert, ...prev];
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        // Also post to server
        fetch('/api/alerts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...newAlert,
            userId: user.uid,
          }),
        }).catch(() => {});
      }

      return newAlert;
    },
    [user, profile]
  );

  const addAlertsBatch = useCallback(
    async (
      items: Array<
        Omit<PriceAlert, 'id' | 'createdAt' | 'triggered' | 'isActive'> & { isActive?: boolean }
      >
    ): Promise<PriceAlert[]> => {
      if (!user) {
        throw new Error(
          'Встановлення сповіщень доступне тільки для зареєстрованих користувачів. Будь ласка, увійдіть або зареєструйтесь.'
        );
      }
      if (!items || items.length === 0) return [];

      if (items.some(item => !Number.isFinite(Number(item.targetPrice)) || Number(item.targetPrice) <= 0 ||
        !['gte', 'lte'].includes(item.condition) || !item.symbol.trim())) {
        throw new Error('Некоректні рівні сповіщення.');
      }
      const baseTime = Date.now();
      const effectiveBotToken = profile?.telegramBotToken || (typeof window !== 'undefined' ? localStorage.getItem('signalhook_tg_token') || undefined : undefined);
      const effectiveChatId = profile?.telegramChatId || (typeof window !== 'undefined' ? localStorage.getItem('signalhook_tg_chat_id') || undefined : undefined);

      const newAlerts: PriceAlert[] = items.map((item, idx) => {
        const alertId = `alert_${baseTime}_${Math.random().toString(36).substring(2, 8)}_${idx}`;
        const cleanSymbol = item.symbol.toUpperCase().replace('/', '').trim();
        return {
          id: alertId,
          userId: user.uid,
          symbol: cleanSymbol,
          exchange: item.exchange,
          marketType: item.marketType,
          targetPrice: Number(item.targetPrice),
          condition: item.condition,
          note: item.note?.trim() || undefined,
          formationName: item.formationName?.trim() || undefined,
          levelType: item.levelType || 'custom',
          createdAt: baseTime + idx,
          isActive: item.isActive !== undefined ? item.isActive : true,
          triggered: false,
          telegramBotToken: effectiveBotToken,
          telegramChatId: effectiveChatId,
        };
      });

      const isFirebase = Boolean(user && !(user as any).isLocalUser);

      if (isFirebase && user) {
        // Atomic batch write to Firestore
        try {
          const batch = writeBatch(db);
          for (const alert of newAlerts) {
            const alertDocRef = doc(db, 'users', user.uid, 'alerts', alert.id);
            batch.set(alertDocRef, cleanForFirestore(alert));
          }
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}/alerts/batch`);
          throw err;
        }

        // Concurrently post to server batch endpoint so backend monitor immediately starts price tracking
        fetch('/api/alerts/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            alerts: newAlerts,
            telegramBotToken: profile?.telegramBotToken,
            telegramChatId: profile?.telegramChatId,
          }),
        }).catch((err) => {
          console.error('Failed to notify server of alerts batch:', err);
        });
      } else {
        // Local registered user fallback
        const storageKey = `signalhook_user_alerts_${user.uid}`;
        setAlerts((prev) => {
          const updated = [...newAlerts, ...prev];
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        fetch('/api/alerts/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.uid,
            alerts: newAlerts,
            telegramBotToken: profile?.telegramBotToken,
            telegramChatId: profile?.telegramChatId,
          }),
        }).catch(() => {});
      }

      return newAlerts;
    },
    [user, profile]
  );

  const deleteAlert = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      const isFirebase = Boolean(user && !(user as any).isLocalUser);

      // Optimistically update React state immediately so UI responds instantaneously
      setAlerts((prev) => prev.filter((a) => a.id !== id));

      // 1. Delete from server first and await completion
      try {
        await fetch(`/api/alerts/${encodeURIComponent(id)}?userId=${encodeURIComponent(user.uid)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('Failed to delete alert from server:', err);
      }

      // 2. Delete from Firestore if authenticated
      if (isFirebase && user) {
        try {
          const alertDocRef = doc(db, 'users', user.uid, 'alerts', id);
          await deleteDoc(alertDocRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/alerts/${id}`);
          return false;
        }
      } else {
        const storageKey = `signalhook_user_alerts_${user.uid}`;
        try {
          const raw = localStorage.getItem(storageKey);
          if (raw) {
            const updated = JSON.parse(raw).filter((a: any) => a.id !== id);
            localStorage.setItem(storageKey, JSON.stringify(updated));
          }
        } catch {}
      }

      return true;
    },
    [user]
  );

  const toggleAlert = useCallback(
    async (id: string) => {
      if (!user) return;
      const existing = alerts.find((a) => a.id === id);
      if (!existing) return;

      const newActive = !existing.isActive;
      const isFirebase = Boolean(user && !(user as any).isLocalUser);
      const response = await fetch(`/api/alerts/${encodeURIComponent(id)}/toggle?userId=${encodeURIComponent(user.uid)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: newActive }),
      });
      const data = await response.json();
      if (!response.ok || !data.success || !data.alert) throw new Error(data.error || 'Не вдалося змінити сповіщення');
      if (userRef.current?.uid !== user.uid) return;
      const updated = alertsRef.current.map(a => a.id === id ? data.alert as PriceAlert : a);
      alertsRef.current = updated;
      setAlerts(updated);
      if (isFirebase) {
        mirrorServerAlerts(user.uid, updated);
      } else {
        const storageKey = `signalhook_user_alerts_${user.uid}`;
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch {}
      }
    },
    [user, alerts, mirrorServerAlerts]
  );

  const clearTriggered = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const triggered = alerts.filter((a) => a.triggered);
    if (triggered.length === 0) return 0;

    // Optimistically update React state
    setAlerts((prev) => prev.filter((a) => !a.triggered));

    // Clear on server first
    try {
      await fetch(`/api/alerts/clear-triggered?userId=${encodeURIComponent(user.uid)}`, {
        method: 'POST',
      });
    } catch (err) {
      console.error('Failed to clear triggered on server:', err);
    }

    const isFirebase = Boolean(user && !(user as any).isLocalUser);

    if (isFirebase && user) {
      try {
        const batch = writeBatch(db);
        triggered.forEach((a) => {
          const ref = doc(db, 'users', user.uid, 'alerts', a.id);
          batch.delete(ref);
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${user.uid}/alerts`);
      }
    } else {
      const storageKey = `signalhook_user_alerts_${user.uid}`;
      try {
        const remaining = alerts.filter((a) => !a.triggered);
        localStorage.setItem(storageKey, JSON.stringify(remaining));
      } catch {}
    }

    return triggered.length;
  }, [user, alerts]);

  // Delete single history record
  const deleteHistoryItem = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      setHistory((prev) => prev.filter((h) => h.id !== id));

      // Delete on server
      try {
        await fetch(`/api/alerts/history/${encodeURIComponent(id)}?userId=${encodeURIComponent(user.uid)}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('Failed to delete history item on server:', err);
      }

      const isFirebase = Boolean(user && !(user as any).isLocalUser);
      if (isFirebase) {
        try {
          const docRef = doc(db, 'users', user.uid, 'history', id);
          await deleteDoc(docRef);
        } catch {}
      }

      return true;
    },
    [user]
  );

  // Clear entire history
  const clearHistory = useCallback(async (): Promise<number> => {
    if (!user) return 0;
    const count = history.length;
    setHistory([]);

    // Clear on server
    try {
      await fetch('/api/alerts/history/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid }),
      });
    } catch (err) {
      console.error('Failed to clear history on server:', err);
    }

    const isFirebase = Boolean(user && !(user as any).isLocalUser);
    if (isFirebase) {
      try {
        const histColRef = collection(db, 'users', user.uid, 'history');
        const snap = await getDocs(histColRef);
        const batch = writeBatch(db);
        snap.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      } catch {}
    }

    return count;
  }, [user, history]);

  // Reactivate an alert from history or triggered list
  const reactivateAlert = useCallback(
    async (item: AlertHistoryItem | PriceAlert): Promise<PriceAlert> => {
      const existing = alerts.find((a) => a.id === (item as any).alertId || a.id === item.id);
      if (existing) {
        await toggleAlert(existing.id);
        return existing;
      }

      // Add fresh alert with same parameters
      return await addAlert({
        symbol: item.symbol,
        exchange: item.exchange,
        marketType: item.marketType,
        targetPrice: item.targetPrice,
        condition: item.condition,
        formationName: item.formationName,
        levelType: item.levelType,
        note: item.note,
        isActive: true,
      });
    },
    [alerts, toggleAlert, addAlert]
  );

  const activeAlertsCount = alerts.filter((a) => a.isActive && !a.triggered).length;
  const triggeredAlertsCount = alerts.filter((a) => a.triggered).length;
  const historyCount = history.length;

  return (
    <AlertsContext.Provider
      value={{
        alerts,
        history,
        loading,
        loadingHistory,
        notificationPermission,
        requestNotificationPermission,
        addAlert,
        addAlertsBatch,
        deleteAlert,
        toggleAlert,
        clearTriggered,
        fetchHistory,
        clearHistory,
        deleteHistoryItem,
        reactivateAlert,
        activeAlertsCount,
        triggeredAlertsCount,
        historyCount,
      }}
    >
      {children}
    </AlertsContext.Provider>
  );
};

export const useAlerts = () => {
  const context = useContext(AlertsContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertsProvider');
  }
  return context;
};
