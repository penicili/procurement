import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Result, Spin } from 'antd'
import { api } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const response = await api.get<{ user: User }>('/auth/me')
      return response.user
    },
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  const value = useMemo<AuthState>(() => {
    const login = async (email: string, password: string) => {
      const response = await api.post<{ user: User }>('/auth/login', { email, password })
      queryClient.setQueryData(['me'], response.user)
      await queryClient.invalidateQueries()
      return response.user
    }

    const logout = async () => {
      try {
        await api.post('/auth/logout')
      } finally {
        queryClient.clear()
        queryClient.setQueryData(['me'], null)
      }
    }

    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      login,
      logout,
    }
  }, [meQuery.data, meQuery.isLoading, queryClient])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return context
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" tip="Memuat sesi..." />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }

  return <>{children}</>
}

export function Forbidden() {
  return <Result status="403" title="Akses ditolak" subTitle="Role Anda tidak memiliki akses ke halaman ini." />
}
