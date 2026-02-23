import { useState, useEffect } from 'react';
import { Dropdown, Button, message } from 'antd';
import { BookOutlined } from '@ant-design/icons';
import type { MenuProps } from 'antd';
import api from '../../api/client';
import { useFilters } from '../../contexts/FilterContext';

interface Preset {
  id?: number;
  name: string;
  severities: number[];
  types: string[];
  layers: number[];
}

export default function PresetSelector() {
  const { setSeverities, setTypes, setLayers } = useFilters();
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    loadPresets();
  }, []);

  const loadPresets = async () => {
    try {
      const [enterprise, user] = await Promise.all([
        api.get('/presets/enterprise'),
        api.get('/presets/user'),
      ]);
      const items: Preset[] = [];
      if (enterprise.data) {
        items.push({ name: `[Entreprise] ${enterprise.data.name}`, ...enterprise.data });
      }
      if (Array.isArray(user.data)) {
        items.push(...user.data.map((p: Preset) => ({ ...p, name: `[Perso] ${p.name}` })));
      }
      setPresets(items);
    } catch {
      // Silently fail — presets are optional
    }
  };

  const applyPreset = (preset: Preset) => {
    setSeverities(preset.severities || []);
    setTypes(preset.types || []);
    setLayers(preset.layers || []);
    message.success(`Filtre "${preset.name}" appliqué`);
  };

  const menuItems: MenuProps['items'] = presets.map((p, i) => ({
    key: String(i),
    label: p.name,
    onClick: () => applyPreset(p),
  }));

  if (menuItems.length === 0) {
    menuItems.push({ key: 'empty', label: 'Aucun preset', disabled: true });
  }

  return (
    <Dropdown menu={{ items: menuItems }} placement="bottomRight">
      <Button icon={<BookOutlined />} title="Presets de filtres" />
    </Dropdown>
  );
}
