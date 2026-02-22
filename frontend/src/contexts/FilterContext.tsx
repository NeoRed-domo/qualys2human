import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface FilterState {
  severities: number[];
  types: string[];
  dateFrom: string | null;
  dateTo: string | null;
  reportId: number | null;
}

interface FilterContextValue extends FilterState {
  setSeverities: (s: number[]) => void;
  setTypes: (t: string[]) => void;
  setDateFrom: (d: string | null) => void;
  setDateTo: (d: string | null) => void;
  setReportId: (id: number | null) => void;
  resetFilters: () => void;
  toQueryString: () => string;
}

const DEFAULT_FILTERS: FilterState = {
  severities: [],
  types: [],
  dateFrom: null,
  dateTo: null,
  reportId: null,
};

const FilterContext = createContext<FilterContextValue | undefined>(undefined);

export function FilterProvider({ children }: { children: ReactNode }) {
  const [severities, setSeverities] = useState<number[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState<string | null>(null);
  const [dateTo, setDateTo] = useState<string | null>(null);
  const [reportId, setReportId] = useState<number | null>(null);

  const resetFilters = useCallback(() => {
    setSeverities([]);
    setTypes([]);
    setDateFrom(null);
    setDateTo(null);
    setReportId(null);
  }, []);

  const toQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (severities.length > 0) params.set('severities', severities.join(','));
    if (types.length > 0) params.set('types', types.join(','));
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    if (reportId) params.set('report_id', String(reportId));
    return params.toString();
  }, [severities, types, dateFrom, dateTo, reportId]);

  return (
    <FilterContext.Provider
      value={{
        severities, types, dateFrom, dateTo, reportId,
        setSeverities, setTypes, setDateFrom, setDateTo, setReportId,
        resetFilters, toQueryString,
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
