import { useContext } from 'react'
import { AuthContext } from '@/application/contexts/AuthContext'

export function useAuth() {
  return useContext(AuthContext)
}
