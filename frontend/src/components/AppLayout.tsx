import { Suspense, useMemo, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Avatar,
  Badge,
  Button,
  Empty,
  Layout,
  List,
  Menu,
  Popover,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import type { MenuProps } from 'antd'
import {
  AppstoreOutlined,
  AuditOutlined,
  BarChartOutlined,
  BellOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FileTextOutlined,
  InboxOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ShoppingOutlined,
  SolutionOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { api } from '../api'
import { useAuth } from '../auth'
import { fromNow } from '../format'
import type { NotificationItem } from '../types'

const { Header, Sider, Content } = Layout

const APPROVER_ROLES = ['Dept Head', 'Finance', 'Procurement Manager', 'Director']

export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [collapsed, setCollapsed] = useState(false)

  const isApprover = !!user && APPROVER_ROLES.includes(user.role)
  const canManageMaster = !!user && ['Finance', 'Procurement Officer', 'Procurement Manager'].includes(user.role)

  const inboxQuery = useQuery({
    queryKey: ['approvals', 'inbox'],
    queryFn: () => api.get<{ items: unknown[]; total: number }>('/approvals'),
    enabled: isApprover,
    refetchInterval: 60_000,
  })

  const notificationQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<{ items: NotificationItem[]; unread: number }>('/notifications'),
    refetchInterval: 30_000,
  })

  const selectedKey = useMemo(() => {
    const path = location.pathname
    if (path === '/') return '/'
    const keys = ['/prs', '/approvals', '/rfqs', '/pos', '/grns', '/invoices', '/reports', '/master']
    return keys.find((key) => path.startsWith(key)) ?? path
  }, [location.pathname])

  const items: MenuProps['items'] = [
    { key: '/', icon: <AppstoreOutlined />, label: <Link to="/">Dashboard</Link> },
    { key: '/prs', icon: <FileTextOutlined />, label: <Link to="/prs">Purchase Request</Link> },
    ...(isApprover
      ? [
          {
            key: '/approvals',
            icon: <AuditOutlined />,
            label: (
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <Link to="/approvals">Approval</Link>
                {(inboxQuery.data?.total ?? 0) > 0 && (
                  <Badge count={inboxQuery.data?.total} size="small" />
                )}
              </span>
            ),
          },
        ]
      : []),
    { key: '/rfqs', icon: <SolutionOutlined />, label: <Link to="/rfqs">RFQ &amp; Quotation</Link> },
    { key: '/pos', icon: <ShoppingOutlined />, label: <Link to="/pos">Purchase Order</Link> },
    { key: '/grns', icon: <InboxOutlined />, label: <Link to="/grns">Penerimaan (GRN)</Link> },
    { key: '/invoices', icon: <DollarOutlined />, label: <Link to="/invoices">Invoice</Link> },
    { key: '/reports', icon: <BarChartOutlined />, label: <Link to="/reports">Laporan</Link> },
    ...(canManageMaster
      ? [{ key: '/master', icon: <DatabaseOutlined />, label: <Link to="/master">Master Data</Link> }]
      : []),
  ]

  const markAllRead = async () => {
    await api.post('/notifications/read-all')
    await queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const openNotification = async (item: NotificationItem) => {
    if (!item.is_read) {
      await api.post(`/notifications/${item.id}/read`)
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
    if (item.link) navigate(item.link)
  }

  const notifications = notificationQuery.data?.items ?? []

  const notificationContent = (
    <div style={{ width: 340 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <Typography.Text strong>Notifikasi</Typography.Text>
        <Button type="link" size="small" onClick={markAllRead} disabled={!notificationQuery.data?.unread}>
          Tandai semua dibaca
        </Button>
      </div>
      {notifications.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Belum ada notifikasi" />
      ) : (
        <List
          size="small"
          dataSource={notifications.slice(0, 8)}
          renderItem={(item) => (
            <List.Item
              style={{ cursor: 'pointer', alignItems: 'flex-start' }}
              onClick={() => void openNotification(item)}
            >
              <List.Item.Meta
                title={
                  <Space size={6}>
                    {!item.is_read && <Badge status="processing" />}
                    <span style={{ fontWeight: item.is_read ? 500 : 700 }}>{item.title}</span>
                  </Space>
                }
                description={
                  <div>
                    <div style={{ fontSize: 12 }}>{item.message}</div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {fromNow(item.created_at)}
                    </div>
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  )

  const userMenu: MenuProps = {
    items: [
      {
        key: 'identity',
        disabled: true,
        label: (
          <div style={{ padding: '4px 0' }}>
            <div style={{ fontWeight: 600 }}>{user?.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user?.email}
            </div>
          </div>
        ),
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Keluar',
        onClick: () => void logout().then(() => navigate('/login')),
      },
    ],
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        theme="light"
        width={232}
        collapsible
        collapsed={collapsed}
        trigger={null}
        breakpoint="lg"
        collapsedWidth={0}
        onBreakpoint={(broken) => setCollapsed(broken)}
        style={{ borderRight: '1px solid #e6e8ef', position: 'sticky', top: 0, height: '100vh' }}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 18px',
            borderBottom: '1px solid #eef0f5',
          }}
        >
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: '#4f46e5',
              color: '#fff',
              display: 'grid',
              placeItems: 'center',
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: '0.04em',
            }}
          >
            P2P
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Procurement</div>
            <div className="muted" style={{ fontSize: 11 }}>
              Procure-to-Receive
            </div>
          </div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[selectedKey]}
          items={items}
          style={{ borderInlineEnd: 0, paddingTop: 8 }}
        />
      </Sider>

      <Layout>
        <Header
          style={{
            background: '#fff',
            borderBottom: '1px solid #e6e8ef',
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 64,
            lineHeight: 1.5,
          }}
        >
          <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed((value) => !value)}
            aria-label="Toggle menu"
          />

          <Space size={16}>
            <Popover
              content={notificationContent}
              trigger="click"
              placement="bottomRight"
              title={null}
            >
              <Badge count={notificationQuery.data?.unread ?? 0} size="small" offset={[-2, 2]}>
                <Button type="text" icon={<BellOutlined style={{ fontSize: 18 }} />} aria-label="Notifikasi" />
              </Badge>
            </Popover>

            <DropdownMenu user={user} menu={userMenu} />
          </Space>
        </Header>

        <Content style={{ padding: 24, width: '100%', maxWidth: 1440, margin: '0 auto' }}>
          <Suspense
            fallback={
              <div style={{ minHeight: 240, display: 'grid', placeItems: 'center' }}>
                <Spin size="large" tip="Memuat halaman..." />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  )
}

function DropdownMenu({ user, menu }: { user: ReturnType<typeof useAuth>['user']; menu: MenuProps }) {
  return (
    <Popover
      content={<Menu items={menu.items} style={{ border: 0, minWidth: 220 }} />}
      trigger="click"
      placement="bottomRight"
    >
      <Space style={{ cursor: 'pointer' }}>
        <Avatar size={32} style={{ background: '#eef2ff', color: '#4338ca' }} icon={<UserOutlined />} />
        <span style={{ lineHeight: 1.2 }}>
          <span style={{ display: 'block', fontWeight: 600, fontSize: 13 }}>{user?.name}</span>
          <Tag color="geekblue" style={{ marginInlineEnd: 0, lineHeight: '16px', fontSize: 10 }}>
            {user?.role}
          </Tag>
        </span>
      </Space>
    </Popover>
  )
}
