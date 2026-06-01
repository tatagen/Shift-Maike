import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Role } from '@/src/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  loginAsAdmin: () => Promise<void>;
  loginAsStaff: (staffId?: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'shiftflow_user_session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
      } catch (e) {
        console.error("Failed to parse saved session", e);
        localStorage.removeItem(LOCAL_STORAGE_KEY);
      }
    }
    setLoading(false);
  }, []);

  const loginAsRole = async (role: Role) => {
    setLoading(true);
    try {
      const mockId = role === 'ADMIN' ? 'mock-admin-id' : 'mock-staff-id';
      
      const userData: User = {
        id: mockId,
        hotelId: "default-hotel",
        role: role,
        name: role === 'ADMIN' ? "管理者ユーザー" : "一般スタッフ",
        maxHoursPerMonth: 160,
        preferredStyle: "DEFAULT"
      };

      setUser(userData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const loginAsAdmin = () => loginAsRole('ADMIN');
  const loginAsStaff = async (staffId?: string, name?: string) => {
    setLoading(true);
    try {
      const userData: User = {
        id: staffId || 'mock-staff-id',
        hotelId: "default-hotel",
        role: 'STAFF',
        name: name || '一般スタッフ',
        maxHoursPerMonth: 160,
        preferredStyle: "DEFAULT"
      };
      setUser(userData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(userData));
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginAsAdmin, loginAsStaff, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
