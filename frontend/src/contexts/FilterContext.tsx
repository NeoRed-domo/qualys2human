import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import api from '../api/client';

const STORAGE_KEY = 'q2h_filters';

interface FilterState {
  severities: number[];
  types: string[];
  layers: number[];
  osClasses: string[];
  freshness: string;
  dateFrom: string | null;
  dateTo: string | null;
  reportId: number | null;
}

interface FilterContextValue extends FilterState {
  setSeverities: (s: number[]) => void;
  setTypes: (t: string[]) => void;
  setLayers: (l: number[]) => void;
  setOsClasses: (o: string[]) => void;
  setFreshness: (f: string) => void;
  setDateFrom: (d: string | null) => void;
  setDateTo: (d: string | null) => void;
  setReportId: (id: number | null) => void;
  resetFilters: () => void;
  toQueryString: () => string;
  ready: boolean;
}

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [severities, setSeverities] = useState<number[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [layers, setLayers] = useState<number[]>([]);
  const [osClasses, setOsClasses] = useState<string[]>([]);
  const [freshness, setFreshness] = useState<string>('active');
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [ready, setReady] = useState(false);

  // Store enterprise defaults so resetFilters can restore them
  const enterpriseDefaults = useRef<{ severities: number[]; types: string[]; layers: number[] }>({
    severities: [],
    types: [],
    layers: [],
  });

  // Load filters on mount: localStorage (returning user) or enterprise preset (new user)
  useEffect(() => {
    const load = async () => {
      // Always fetch enterprise preset (needed for resetFilters)
      try {
        const resp = await api.get('/presets/enterprise');
        const { severities: sev, types: typ, layers: lay } = resp.data;
        enterpriseDefaults.current = {
          severities: Array.isArray(sev) ? sev : [],
          types: Array.isArray(typ) ? typ : [],
          layers: Array.isArray(lay) ? lay : [],
        };
      } catch {
        // keep empty defaults
      }

      // Check localStorage for user's saved filters
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          const p = JSON.parse(saved);
          if (Array.isArray(p.severities)) setSeverities(p.severities);
          if (Array.isArray(p.types)) setTypes(p.types);
          if (Array.isArray(p.layers)) setLayers(p.layers);
          if (Array.isArray(p.osClasses)) setOsClasses(p.osClasses);
          if (typeof p.freshness === 'string') setFreshness(p.freshness);
        } catch {
          // Corrupted — fall through to enterprise defaults
          applyEnterprise();
        }
      } else {
        // First visit — apply enterprise preset
        applyEnterprise();
      }

      setReady(true);
    };

    const applyEnterprise = () => {
      const d = enterpriseDefaults.current;
      if (d.severities.length > 0) setSeverities(d.severities);
      if (d.types.length > 0) setTypes(d.types);
      if (d.layers.length > 0) setLayers(d.layers);
    };

    load();
  }, []);

  // Persist filters to localStorage whenever they change
  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      severities, types, layers, osClasses, freshness,
    }));
  }, [severities, types, layers, osClasses, freshness, ready]);

  const resetFilters = useCallback(() => {
    // Reset to enterprise defaults and clear saved preferences
    localStorage.removeItem(STORAGE_KEY);
    setSeverities(enterpriseDefaults.current.severities);
    setTypes(enterpriseDefaults.current.types);
    setLayers(enterpriseDefaults.current.layers);
    setOsClasses([]);
    setFreshness('active');
    setDateFrom(null);
    setDateTo(null);
    setReportId(null);
  }, []);

  const toQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (severities.length > 0) params.set('severities', severities.join(','));
    if (types.length > 0) params.set('types', types.join(','));
    if (layers.length > 0) params.set('layers', layers.join(','));
    if (osClasses.length > 0) params.set('os_classes', osClasses.join(','));
    if (freshness && freshness !== 'active') params.set('freshness', freshness);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (reportId) params.set('report_id', String(reportId));
    return params.toString();
  }, [severities, types, layers, osClasses, freshness, dateFrom, dateTo, reportId]);

  return (
    <FilterContext.Provider
      value={{
        severities, types, layers, osClasses, freshness, dateFrom, dateTo, reportId,
        setSeverities, setTypes, setLayers, setOsClasses, setFreshness, setDateFrom, setDateTo, setReportId,
        resetFilters, toQueryString, ready,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilters() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used within FilterProvider');
  return ctx;
}
