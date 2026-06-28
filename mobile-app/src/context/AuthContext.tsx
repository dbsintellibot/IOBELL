import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type AuthContextType = {
  session: Session | null;
  loading: boolean;
  schoolId: string | null;
  schoolName: string | null;
  schoolLogo: string | null;
  schoolAddress: string | null;
  ttsEnabled: boolean;
};

const AuthContext = createContext<AuthContextType>({ session: null, loading: true, schoolId: null, schoolName: null, schoolLogo: null, schoolAddress: null, ttsEnabled: false });

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [schoolLogo, setSchoolLogo] = useState<string | null>(null);
  const [schoolAddress, setSchoolAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [ttsEnabled, setTtsEnabled] = useState(false);

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
          setSchoolName(null);
          setSchoolLogo(null);
          setSchoolAddress(null);
          setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchSchoolId = async (userId: string) => {
    try {
        const { data: userData, error } = await supabase
            .from('users')
            .select('school_id, tts_enabled')
            .eq('id', userId)
            .single();
        
        if (error) {
            console.error('Error fetching school ID:', error);
        }
        
        if (userData) {
            setTtsEnabled(!!userData.tts_enabled);
        } else {
            setTtsEnabled(false);
        }

        if (userData && userData.school_id) {
            setSchoolId(userData.school_id);
            
            // Fetch School Details (Name & Logo & Address)
            const { data: schoolData } = await supabase
                .from('schools')
                .select('name, logo_url, address')
                .eq('id', userData.school_id)
                .single();
                
            if (schoolData) {
                setSchoolName(schoolData.name);
                setSchoolLogo(schoolData.logo_url);
                setSchoolAddress(schoolData.address);
            }
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
    <AuthContext.Provider value={{ session, loading, schoolId, schoolName, schoolLogo, schoolAddress, ttsEnabled }}>
      {children}
    </AuthContext.Provider>
  );
};
