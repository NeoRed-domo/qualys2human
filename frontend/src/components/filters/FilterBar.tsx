import { useEffect, useState } from 'react';
import { Row, Col, Checkbox, Select, DatePicker, Button, Card, Space, Tooltip, message } from 'antd';
import { ClearOutlined, BankOutlined } from '@ant-design/icons';
import { useFilters } from '../../contexts/FilterContext';
import PresetSelector from './PresetSelector';
import api from '../../api/client';
import dayjs from 'dayjs';

const SEVERITY_OPTIONS = [
  { label: 'Urgent (5)', value: 5 },
  { label: 'Critique (4)', value: 4 },
  { label: 'Sérieux (3)', value: 3 },
  { label: 'Moyen (2)', value: 2 },
  { label: 'Minimal (1)', value: 1 },
];

const TYPE_OPTIONS = [
  { label: 'Vulnérabilité', value: 'Vuln' },
  { label: 'Pratique', value: 'Practice' },
  { label: 'Information', value: 'Ig' },
];

const OS_CLASS_OPTIONS = [
  { label: 'Windows', value: 'windows' },
  { label: 'NIX (Linux/Unix)', value: 'nix' },
];

interface LayerOption {
  label: string;
  value: number;
}

interface FilterBarProps {
  extra?: React.ReactNode;
}

export default function FilterBar({ extra }: FilterBarProps) {
  const {
    severities, types, layers, osClasses, freshness, dateFrom, dateTo,
    setSeverities, setTypes, setLayers, setOsClasses, setFreshness, setDateFrom, setDateTo,
    resetFilters, applyEnterprisePreset,
  } = useFilters();
  const [layerOptions, setLayerOptions] = useState<LayerOption[]>([]);

  useEffect(() => {
    api.get('/layers').then((resp) => {
      setLayerOptions(
        resp.data.map((l: { id: number; name: string }) => ({ label: l.name, value: l.id }))
      );
    }).catch(() => {});
  }, []);

  const handleApplyEnterprise = async () => {
    await applyEnterprisePreset();
    message.success('Règles entreprise appliquées');
  };

  return (
    <Card size="small" style={{ marginBottom: 16 }}>
      <Row gutter={[16, 12]} align="middle">
        <Col xs={24} md={10}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Sévérité</div>
          <Checkbox.Group
            options={SEVERITY_OPTIONS}
            value={severities}
            onChange={(val) => setSeverities(val as number[])}
          />
        </Col>

        <Col xs={24} md={5}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Type</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Tous les types"
            options={TYPE_OPTIONS}
            value={types}
            onChange={setTypes}
            allowClear
          />
        </Col>

        <Col xs={24} md={4}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Catégorisation</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Toutes"
            options={[...layerOptions, { label: 'Autre', value: 0 }]}
            value={layers}
            onChange={setLayers}
            allowClear
          />
        </Col>

        <Col xs={24} md={3}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Classe OS</div>
          <Select
            mode="multiple"
            style={{ width: '100%' }}
            placeholder="Tous"
            options={OS_CLASS_OPTIONS}
            value={osClasses}
            onChange={setOsClasses}
            allowClear
          />
        </Col>

        <Col xs={24} md={2}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Fraîcheur</div>
          <Select
            style={{ width: '100%' }}
            value={freshness}
            onChange={setFreshness}
            options={[
              { label: 'Actives', value: 'active' },
              { label: 'Peut-être obsolètes', value: 'stale' },
              { label: 'Tout', value: 'all' },
            ]}
          />
        </Col>

        <Col xs={12} md={3}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Date début</div>
          <DatePicker
            style={{ width: '100%' }}
            value={dateFrom ? dayjs(dateFrom) : null}
            onChange={(d) => setDateFrom(d ? d.format('YYYY-MM-DD') : null)}
          />
        </Col>

        <Col xs={12} md={3}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>Date fin</div>
          <DatePicker
            style={{ width: '100%' }}
            value={dateTo ? dayjs(dateTo) : null}
            onChange={(d) => setDateTo(d ? d.format('YYYY-MM-DD') : null)}
          />
        </Col>

        <Col xs={24} md={2}>
          <div style={{ marginBottom: 4, fontWeight: 500, fontSize: 12 }}>&nbsp;</div>
          <Space size={4}>
            <Tooltip title="Réinitialiser">
              <Button icon={<ClearOutlined />} onClick={resetFilters} />
            </Tooltip>
            <Tooltip title="Appliquer les règles entreprise">
              <Button icon={<BankOutlined />} onClick={handleApplyEnterprise} />
            </Tooltip>
            <PresetSelector />
          </Space>
        </Col>

        {extra && (
          <Col flex="auto" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-end' }}>
            {extra}
          </Col>
        )}
      </Row>
    </Card>
  );
}
