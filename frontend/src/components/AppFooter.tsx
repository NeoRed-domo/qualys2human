import { useEffect, useState } from 'react';
import { Layout, Typography } from 'antd';

const { Text } = Typography;

export default function AppFooter() {
  const [footerText, setFooterText] = useState('');

  useEffect(() => {
    fetch('/api/branding/settings')
      .then((resp) => {
        if (!resp.ok) throw new Error('Failed to load settings');
        return resp.json();
      })
      .then((data) => setFooterText(data.footer_text || ''))
      .catch(() => setFooterText(''));
  }, []);

  const displayText = footerText || 'Qualys2Human';
  const year = new Date().getFullYear();

  return (
    <Layout.Footer style={{ textAlign: 'center', padding: '12px 24px', background: '#f0f2f5' }}>
      <Text type="secondary" style={{ fontSize: 13 }}>
        {displayText} - NeoRed - 2026/{year}
      </Text>
    </Layout.Footer>
  );
}
