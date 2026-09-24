import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './AuthContext';
import {
  ArchivedFormation,
  ScannedCoin,
  DetectedFormation,
  Timeframe,
  ChartMarkerInfo,
  ChartRestoreParams,
} from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrors';
import { cleanForFirestore } from '../lib/firestoreUtils';

interface SaveArchiveOptions {
  timeframe?: Timeframe;
  historyLimit?: number;
  markers?: ChartMarkerInfo[];
  chartParams?: Partial<ChartRestoreParams>;
  notes?: string;
  currentPrice?: number;
}

interface ArchiveContextType {
  archivedFormations: ArchivedFormation[];
  loading: boolean;
  saveToArchive: (
    coin: ScannedCoin,
    formation: DetectedFormation,
    options?: SaveArchiveOptions
  ) => Promise<ArchivedFormation>;
  removeFromArchive: (id: string) => Promise<boolean>;
  clearUserArchive: () => Promise<boolean>;
  isArchived: (symbol: string, formationIdOrName: string) => boolean;
  getArchivedItem: (symbol: string, formationIdOrName: string) => ArchivedFormation | undefined;
  archiveCount: number;
}

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [archivedFormations, setArchivedFormations] = useState<ArchivedFormation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Sync with Firestore (if user is authenticated) or user-scoped localStorage (if local/offline)
  useEffect(() => {
    let unsubscribeFirestore: (() => void) | null = null;

    if (!user) {
      // Unauthenticated: clean out memory to guarantee zero data leakage between users
      setArchivedFormations([]);
      setLoading(false);
      return;
    }

    const currentUid = user.uid;
    // Reset immediately on user change to prevent any visual flicker of previous user's items
    setArchivedFormations([]);
    setLoading(true);

    const isLocal = Boolean((user as any).isLocalUser);

    if (isLocal) {
      try {
        const saved = localStorage.getItem(`signalhook_archive_${currentUid}`);
        const list: ArchivedFormation[] = saved ? JSON.parse(saved) : [];
        const userScopedList = Array.isArray(list)
          ? list.filter((item) => item.userId === currentUid || !item.userId).map(item => ({ ...item, userId: currentUid }))
          : [];
        setArchivedFormations(userScopedList);
      } catch {
        setArchivedFormations([]);
      }
      setLoading(false);
      return;
    }

    // Real Firebase User: Subscribe to personal Firestore subcollection users/{uid}/archive
    const colPath = `users/${currentUid}/archive`;
    const archiveColRef = collection(db, 'users', currentUid, 'archive');

    try {
      unsubscribeFirestore = onSnapshot(
        archiveColRef,
        (snapshot) => {
          const items: ArchivedFormation[] = [];
          snapshot.forEach((docSnap) => {
            const data = docSnap.data() as ArchivedFormation;
            // Guarantee ownership
            if (!data.userId || data.userId === currentUid) {
              items.push({ ...data, userId: currentUid });
            }
          });

          // Sort by savedAtTimestamp descending
          items.sort((a, b) => (b.savedAtTimestamp || 0) - (a.savedAtTimestamp || 0));
          setArchivedFormations(items);

          // Update strictly user-scoped cache
          try {
            localStorage.setItem(`signalhook_archive_${currentUid}`, JSON.stringify(items));
          } catch {}

          setLoading(false);
        },
        (error) => {
          console.warn('Firestore Archive snapshot listener error:', error);
          // Fallback to user-scoped local cache if network/offline
          try {
            const saved = localStorage.getItem(`signalhook_archive_${currentUid}`);
            if (saved) {
              setArchivedFormations(JSON.parse(saved));
            }
          } catch {}
          setLoading(false);
        }
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, colPath);
      setLoading(false);
    }

    return () => {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }
    };
  }, [user?.uid]);

  // Check if a specific coin + formation is already in archive
  const isArchived = useCallback(
    (symbol: string, formationIdOrName: string) => {
      const cleanSym = symbol.toUpperCase().replace('/', '').trim();
      return archivedFormations.some((item) => {
        const itemSym = item.symbol.toUpperCase().replace('/', '').trim();
        return (
          itemSym === cleanSym &&
          (item.formation.id === formationIdOrName ||
            item.formation.name === formationIdOrName ||
            item.formationName === formationIdOrName)
        );
      });
    },
    [archivedFormations]
  );

  const getArchivedItem = useCallback(
    (symbol: string, formationIdOrName: string) => {
      const cleanSym = symbol.toUpperCase().replace('/', '').trim();
      return archivedFormations.find((item) => {
        const itemSym = item.symbol.toUpperCase().replace('/', '').trim();
        return (
          itemSym === cleanSym &&
          (item.formation.id === formationIdOrName ||
            item.formation.name === formationIdOrName ||
            item.formationName === formationIdOrName)
        );
      });
    },
    [archivedFormations]
  );

  // Save formation to archive
  const saveToArchive = useCallback(
    async (
      coin: ScannedCoin,
      formation: DetectedFormation,
      options?: SaveArchiveOptions
    ): Promise<ArchivedFormation> => {
      if (!user) {
        throw new Error('Увійдіть у профіль, щоб зберегти формацію у свій особистий архів');
      }
      const currentUserId = user.uid;
      const cleanSym = coin.symbol.toUpperCase().replace('/', '').trim();
      const timestamp = Date.now();
      const uniqueId = `arch_${cleanSym.toLowerCase()}_${formation.patternKey || 'p'}_${timestamp}`;

      const activeTimeframe = options?.timeframe || coin.timeframe || '1h';
      const activeLimit = options?.historyLimit || 500;
      const refPrice = options?.currentPrice || coin.currentPrice || formation.levels.entryPrice;

      // Construct comprehensive markers list
      const markersList: ChartMarkerInfo[] = options?.markers && options.markers.length > 0
        ? options.markers
        : [
            {
              id: `marker_entry_${uniqueId}`,
              type: 'entry',
              label: `Вхід: $${formation.levels.entryPrice}`,
              price: formation.levels.entryPrice,
              color: '#38bdf8',
              lineStyle: 'dashed',
              lineWidth: 2,
              notes: 'Точка входу в позицію за формацією',
            },
            {
              id: `marker_target_${uniqueId}`,
              type: 'target',
              label: `Ціль (Тейк): $${formation.levels.targetPrice}`,
              price: formation.levels.targetPrice,
              color: '#10b981',
              lineStyle: 'solid',
              lineWidth: 2,
              notes: `Очікуваний прибуток +${Math.abs(formation.potentialProfitPct)}%`,
            },
            {
              id: `marker_stop_${uniqueId}`,
              type: 'stop_loss',
              label: `Стоп-лосс: $${formation.levels.stopLossPrice}`,
              price: formation.levels.stopLossPrice,
              color: '#ef4444',
              lineStyle: 'solid',
              lineWidth: 2,
              notes: `Ризик -${Math.abs(formation.potentialRiskPct)}%`,
            },
          ];

      if (formation.levels.necklinePrice) {
        markersList.push({
          id: `marker_neckline_${uniqueId}`,
          type: 'neckline',
          label: `Лінія шиї: $${formation.levels.necklinePrice}`,
          price: formation.levels.necklinePrice,
          color: '#f59e0b',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      if (formation.levels.resistancePrice) {
        markersList.push({
          id: `marker_res_${uniqueId}`,
          type: 'resistance',
          label: `Опір: $${formation.levels.resistancePrice}`,
          price: formation.levels.resistancePrice,
          color: '#f59e0b',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      if (formation.levels.supportPrice) {
        markersList.push({
          id: `marker_sup_${uniqueId}`,
          type: 'support',
          label: `Підтримка: $${formation.levels.supportPrice}`,
          price: formation.levels.supportPrice,
          color: '#a855f7',
          lineStyle: 'dotted',
          lineWidth: 1,
        });
      }

      const chartParams: ChartRestoreParams = {
        timeframe: activeTimeframe,
        historyLimit: activeLimit,
        lastClosePrice: refPrice,
        visibleRange: options?.chartParams?.visibleRange || { from: 0, to: 80 },
        savedAtCandleTime: Math.floor(timestamp / 1000),
      };

      const newArchiveItem: ArchivedFormation = {
        id: uniqueId,
        userId: currentUserId,
        symbol: cleanSym,
        baseAsset: coin.baseAsset || cleanSym.replace('USDT', ''),
        quoteAsset: coin.quoteAsset || 'USDT',
        exchange: coin.exchange,
        marketType: coin.marketType,
        timeframe: activeTimeframe,
        formationName: formation.name,
        bias: formation.bias,
        confidence: formation.confidence,
        status: formation.status,
        entryPrice: formation.levels.entryPrice,
        targetPrice: formation.levels.targetPrice,
        stopLossPrice: formation.levels.stopLossPrice,
        necklinePrice: formation.levels.necklinePrice,
        resistancePrice: formation.levels.resistancePrice,
        supportPrice: formation.levels.supportPrice,
        savedPrice: refPrice,
        formation: { ...formation },
        markers: markersList,
        chartParams,
        notes: options?.notes || `${formation.name} • ${coin.exchange.toUpperCase()} • ${activeTimeframe}`,
        createdAt: new Date(timestamp).toISOString(),
        savedAtTimestamp: timestamp,
      };

      const isFirebase = Boolean(user && !(user as any).isLocalUser);

      if (isFirebase) {
        const docPath = `users/${currentUserId}/archive/${uniqueId}`;
        try {
          const docRef = doc(db, 'users', currentUserId, 'archive', uniqueId);
          await setDoc(docRef, cleanForFirestore(newArchiveItem));
        } catch (err) {
          handleFirestoreError(err, OperationType.WRITE, docPath);
        }
      }

      // Update state & user-scoped storage immediately
      setArchivedFormations((prev) => {
        const filtered = prev.filter((item) => item.id !== uniqueId);
        const updated = [newArchiveItem, ...filtered];
        try {
          localStorage.setItem(`signalhook_archive_${currentUserId}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      return newArchiveItem;
    },
    [user]
  );

  // Remove formation from current user's archive
  const removeFromArchive = useCallback(
    async (id: string): Promise<boolean> => {
      if (!user) return false;
      const currentUserId = user.uid;
      const isFirebase = Boolean(user && !(user as any).isLocalUser);

      if (isFirebase) {
        const docPath = `users/${currentUserId}/archive/${id}`;
        try {
          const docRef = doc(db, 'users', currentUserId, 'archive', id);
          await deleteDoc(docRef);
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, docPath);
          return false;
        }
      }

      setArchivedFormations((prev) => {
        const updated = prev.filter((item) => item.id !== id);
        try {
          localStorage.setItem(`signalhook_archive_${currentUserId}`, JSON.stringify(updated));
        } catch {}
        return updated;
      });

      return true;
    },
    [user]
  );

  // Clear all formations for current user only
  const clearUserArchive = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const currentUserId = user.uid;
    const isFirebase = Boolean(user && !(user as any).isLocalUser);

    if (isFirebase) {
      const colPath = `users/${currentUserId}/archive`;
      try {
        const archiveColRef = collection(db, 'users', currentUserId, 'archive');
        const snap = await getDocs(archiveColRef);
        const batch = writeBatch(db);
        snap.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, colPath);
        return false;
      }
    }

    setArchivedFormations([]);
    try {
      localStorage.removeItem(`signalhook_archive_${currentUserId}`);
    } catch {}

    return true;
  }, [user]);

  const archiveCount = useMemo(() => archivedFormations.length, [archivedFormations]);

  return (
    <ArchiveContext.Provider
      value={{
        archivedFormations,
        loading,
        saveToArchive,
        removeFromArchive,
        clearUserArchive,
        isArchived,
        getArchivedItem,
        archiveCount,
      }}
    >
      {children}
    </ArchiveContext.Provider>
  );
};

export const useArchive = (): ArchiveContextType => {
  const context = useContext(ArchiveContext);
  if (!context) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
};
