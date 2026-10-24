import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Space, Typography } from 'antd'
import { ArrowLeftOutlined } from '@ant-design/icons'

interface PageHeaderProps {
  title: ReactNode
  subtitle?: ReactNode
  extra?: ReactNode
  back?: boolean
}

export function PageHeader({ title, subtitle, extra, back }: PageHeaderProps) {
  const navigate = useNavigate()

  return (
    <div className="page-header">
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
        {back && (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)} aria-label="Kembali" />
        )}
        <div style={{ minWidth: 0 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
              {subtitle}
            </Typography.Text>
          )}
        </div>
      </div>
      {extra && <Space wrap>{extra}</Space>}
    </div>
  )
}
