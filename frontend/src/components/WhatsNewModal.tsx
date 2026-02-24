import { Modal, Typography, Divider } from 'antd';
import { BugOutlined, RocketOutlined } from '@ant-design/icons';

const { Title, Text, Link } = Typography;

interface ReleaseNotes {
  version: string;
  date: string;
  title: string;
  fixes: string[];
  improvements: string[];
  changelog_url: string;
}

interface WhatsNewModalProps {
  open: boolean;
  releaseNotes: ReleaseNotes;
  onClose: () => void;
}

export default function WhatsNewModal({ open, releaseNotes, onClose }: WhatsNewModalProps) {
  return (
    <Modal
      open={open}
      title={<Title level={4} style={{ margin: 0 }}>Nouveautés v{releaseNotes.version}</Title>}
      onCancel={onClose}
      onOk={onClose}
      okText="Compris"
      cancelButtonProps={{ style: { display: 'none' } }}
      width={520}
    >
      <Text type="secondary">{releaseNotes.date} — {releaseNotes.title}</Text>

      {releaseNotes.fixes.length > 0 && (
        <>
          <Divider orientation="left" plain>
            <BugOutlined /> Corrections
          </Divider>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {releaseNotes.fixes.map((fix, i) => (
              <li key={i}>{fix}</li>
            ))}
          </ul>
        </>
      )}

      {releaseNotes.improvements.length > 0 && (
        <>
          <Divider orientation="left" plain>
            <RocketOutlined /> Améliorations
          </Divider>
          <ul style={{ paddingLeft: 20, margin: 0 }}>
            {releaseNotes.improvements.map((imp, i) => (
              <li key={i}>{imp}</li>
            ))}
          </ul>
        </>
      )}

      <Divider />
      <Text type="secondary">
        Changelog complet :{' '}
        <Link href={releaseNotes.changelog_url} target="_blank">
          GitHub
        </Link>
      </Text>
    </Modal>
  );
}
