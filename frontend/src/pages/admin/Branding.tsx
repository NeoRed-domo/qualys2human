import { useEffect, useState } from 'react';
import { Card, Upload, Button, message, Space, Typography, Image, Input } from 'antd';
import { UploadOutlined, DeleteOutlined, DownloadOutlined, SaveOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import api from '../../api/client';

const { Text, Paragraph } = Typography;

export default function Branding() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [footerText, setFooterText] = useState('');
  const [savingFooter, setSavingFooter] = useState(false);

  useEffect(() => {
    // Fetch logo
    const token = localStorage.getItem('access_token');
    fetch('/api/branding/logo', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resp) => {
        if (!resp.ok) throw new Error('No logo');
        return resp.blob();
      })
      .then((blob) => setLogoUrl(URL.createObjectURL(blob)))
      .catch(() => setLogoUrl(null));

    // Fetch branding settings
    fetch('/api/branding/settings')
      .then((resp) => resp.json())
      .then((data) => setFooterText(data.footer_text || ''))
      .catch(() => setFooterText(''));
  }, [refresh]);

  const uploadProps: UploadProps = {
    name: 'file',
    accept: '.svg,.png,.jpg,.jpeg',
    showUploadList: false,
    customRequest: async (options) => {
      const { file, onSuccess, onError } = options;
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file as Blob);
      try {
        const token = localStorage.getItem('access_token');
        const resp = await fetch('/api/branding/logo', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!resp.ok) {
          const err = await resp.json();
          throw new Error(err.detail || 'Upload failed');
        }
        message.success('Logo mis à jour');
        onSuccess?.(await resp.json());
        setRefresh((r) => r + 1);
      } catch (err: any) {
        message.error(err.message || "Erreur lors de l'upload");
        onError?.(err);
      } finally {
        setUploading(false);
      }
    },
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete('/branding/logo');
      message.success('Logo par défaut restauré');
      setRefresh((r) => r + 1);
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur');
    } finally {
      setDeleting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const token = localStorage.getItem('access_token');
    fetch('/api/branding/template', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((resp) => resp.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'logo-template.svg';
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => message.error('Erreur lors du téléchargement'));
  };

  const handleSaveFooter = async () => {
    setSavingFooter(true);
    try {
      await api.put('/branding/settings', { footer_text: footerText });
      message.success('Texte du bas de page enregistré');
    } catch (err: any) {
      message.error(err.response?.data?.detail || 'Erreur lors de la sauvegarde');
    } finally {
      setSavingFooter(false);
    }
  };

  const footerPreview = `${footerText || 'Qualys2Human'} - NeoRed - 2026/${new Date().getFullYear()}`;

  return (
    <div>
      <Card title="Logo de l'application">
        <div style={{ textAlign: 'center', marginBottom: 24, padding: 24, background: '#fafafa', borderRadius: 8 }}>
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logo actuel"
              style={{ maxHeight: 100, maxWidth: 400 }}
              preview={false}
            />
          ) : (
            <Text type="secondary">Aucun logo configuré</Text>
          )}
        </div>

        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Upload {...uploadProps}>
              <Button icon={<UploadOutlined />} type="primary" loading={uploading}>
                Importer un logo
              </Button>
            </Upload>
            <Button icon={<DeleteOutlined />} danger onClick={handleDelete} loading={deleting}>
              Restaurer le logo par défaut
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
              Télécharger le gabarit SVG
            </Button>
          </Space>

          <Paragraph type="secondary" style={{ marginTop: 16 }}>
            Formats acceptés : SVG, PNG, JPG (max 500 Ko). Taille recommandée : 200x50 pixels.
          </Paragraph>
        </Space>
      </Card>

      <Card title="Bas de page" style={{ marginTop: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>
            <Text strong>Texte personnalisé</Text>
            <Input
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              placeholder="Qualys2Human"
              style={{ marginTop: 8 }}
            />
            <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
              Ce texte apparaîtra dans le bas de page. Laissez vide pour afficher « Qualys2Human ».
            </Paragraph>
          </div>

          <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 8, textAlign: 'center' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>Aperçu :</Text>
            <div style={{ marginTop: 4 }}>
              <Text type="secondary" style={{ fontSize: 13 }}>{footerPreview}</Text>
            </div>
          </div>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveFooter}
            loading={savingFooter}
          >
            Enregistrer
          </Button>
        </Space>
      </Card>
    </div>
  );
}
