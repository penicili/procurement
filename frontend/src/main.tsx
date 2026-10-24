import { useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { App as AntApp, ConfigProvider } from 'antd'
import idID from 'antd/locale/id_ID'
import dayjs from 'dayjs'
import 'dayjs/locale/id'
import App from './App'
import { ApiError } from './api'
import { AuthProvider } from './auth'
import { notify, setMessenger } from './notify'
import './index.css'

dayjs.locale('id')

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) return
      notify.error(error.message)
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      notify.error(error.message)
    },
  }),
})

function Bootstrap() {
  const { message } = AntApp.useApp()

  useEffect(() => {
    setMessenger({
      error: (content) => void message.error(content),
      success: (content) => void message.success(content),
      info: (content) => void message.info(content),
    })
  }, [message])

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <ConfigProvider
    locale={idID}
    theme={{
      token: {
        colorPrimary: '#4f46e5',
        borderRadius: 8,
        colorBgLayout: '#f4f5f9',
        fontSize: 14,
      },
    }}
  >
    <AntApp>
      <Bootstrap />
    </AntApp>
  </ConfigProvider>,
)
