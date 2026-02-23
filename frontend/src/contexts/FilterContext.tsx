import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import api from '../api/client';

interface FilterState {
  severities: number[];
  types: string[];
  layers: number[];
  dateFrom: string | null;
  dateTo: string | null;
  reportId: number | null;
}

interface FilterContextValue extends FilterState {
  setSeverities: (s: number[]) => void;
  setTypes: (t: string[]) => void;
  setLayers: (l: number[]) => void;
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

  // Load enterprise rules as default filters on mount
  useEffect(() => {
    api.get('/presets/enterprise')
      .then((resp) => {
        const { severities: sev, types: typ, layers: lay } = resp.data;
        const defaults = {
          severities: Array.isArray(sev) ? sev : [],
          types: Array.isArray(typ) ? typ : [],
          layers: Array.isArray(lay) ? lay : [],
        };
        enterpriseDefaults.current = defaults;
        if (defaults.severities.length > 0) setSeverities(defaults.severities);
        if (defaults.types.length > 0) setTypes(defaults.types);
        if (defaults.layers.length > 0) setLayers(defaults.layers);
      })
      .catch(() => {
        // If not authenticated or API error, continue with empty defaults
      })
      .finally(() => setReady(true));
  }, []);

  const resetFilters = useCallback(() => {
    // Reset to enterprise defaults, not empty
    setSeverities(enterpriseDefaults.current.severities);
    setTypes(enterpriseDefaults.current.types);
    setLayers(enterpriseDefaults.current.layers);
    setDateFrom(null);
    setDateTo(null);
    setReportId(null);
  }, []);

  const toQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (severities.length > 0) params.set('severities', severities.join(','));
    if (types.length > 0) params.set('types', types.join(','));
    if (layers.length > 0) params.set('layers', layers.join(','));
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (reportId) params.set('report_id', String(reportId));
    return params.toString();
  }, [severities, types, layers, dateFrom, dateTo, reportId]);

  return (
    <FilterContext.Provider
      value={{
        severities, types, layers, dateFrom, dateTo, reportId,
        setSeverities, setTypes, setLayers, setDateFrom, setDateTo, setReportId,
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
