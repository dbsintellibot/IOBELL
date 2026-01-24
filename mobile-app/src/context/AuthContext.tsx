import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  schoolId: string | null;
};

const AuthContext = createContext<AuthContextType>({ session: null, loading: true, schoolId: null });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchSchoolId(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
          fetchSchoolId(session.user.id);
      } else {
          setSchoolId(null);
          setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSchoolId = async (userId: string) => {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('school_id')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching school ID:', error);
            // If user not found in public.users, it might be a new user or RLS issue.
            // We'll leave schoolId as null, which might prompt a setup screen or "Contact Admin" message.
        }
        
        if (data) {
            setSchoolId(data.school_id);
        } else {
            console.warn('User found but no school_id in public.users');
        }
    } catch (e) {
        console.error('Error fetching school ID:', e);
    } finally {
        setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ session, loading, schoolId }}>
      {children}
    </AuthContext.Provider>
  );
};
