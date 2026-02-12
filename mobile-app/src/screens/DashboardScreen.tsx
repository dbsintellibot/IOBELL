import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, Image } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Bell, Clock, Calendar, Zap, AlertTriangle, LogOut } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { schoolId, schoolName, schoolLogo } = useAuth();
  const [nextBell, setNextBell] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<string>('Loading...');
  const [refreshing, setRefreshing] = useState(false);

  // Define fetchDashboardData first so it can be used in useEffect
  const fetchDashboardData = React.useCallback(async () => {
    if (!schoolId) return;
    setRefreshing(true);
    try {
      // 1. Fetch Active Profile from DB
      const { data: profiles, error: profileError } = await supabase
        .from('bell_profiles')
        .select('id, name, is_active')
        .eq('school_id', schoolId)
        .order('is_active', { ascending: false });

      if (profileError) throw profileError;

      if (!profiles || profiles.length === 0) {
        setActiveProfile('No Profiles');
        setNextBell('--:--');
        return;
      }

      // Use the one marked is_active, or the first one if none are active
      const active = profiles.find(p => p.is_active) || profiles[0];
      
      // Update state immediately for profile
      setActiveProfile(active.name);
      AsyncStorage.setItem(`school_${schoolId}_dashboard_activeProfile`, active.name);
      AsyncStorage.setItem(`school_${schoolId}_activeProfileId`, active.id);

      // 2. Fetch Bells for the target profile
      const today = new Date().getDay();
      const { data: bells, error: bellError } = await supabase
        .from('bell_times')
        .select('bell_time')
        .eq('profile_id', active.id)
        .contains('day_of_week', [today])
        .order('bell_time', { ascending: true });

      if (bellError) throw bellError;

      if (bells && bells.length > 0) {
        const now = new Date();
        const currentTime = now.toLocaleTimeString('en-GB', { hour12: false }); // HH:MM:SS
        const next = bells.find(b => b.bell_time > currentTime);
        
        let displayTime = 'Done';
        if (next) {
          // Format next bell time
          const [h, m] = next.bell_time.split(':');
          const hour = parseInt(h);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const hour12 = hour % 12 || 12;
          displayTime = `${hour12}:${m} ${ampm}`;
        }
        setNextBell(displayTime);
        AsyncStorage.setItem(`school_${schoolId}_dashboard_nextBell`, displayTime);
      } else {
        setNextBell('No Bells');
        AsyncStorage.setItem(`school_${schoolId}_dashboard_nextBell`, 'No Bells');
      }
    } catch (e) {
      console.log(e);
    } finally {
      setRefreshing(false);
    }
  }, [schoolId]);

  const loadCachedData = React.useCallback(async () => {
    if (!schoolId) return;
    try {
      const cachedProfile = await AsyncStorage.getItem(`school_${schoolId}_dashboard_activeProfile`);
      const cachedNextBell = await AsyncStorage.getItem(`school_${schoolId}_dashboard_nextBell`);
      if (cachedProfile) setActiveProfile(cachedProfile);
      if (cachedNextBell) setNextBell(cachedNextBell);
    } catch (e) {
      console.log(e);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) {
      loadCachedData();
      fetchDashboardData();
    }
  }, [schoolId, loadCachedData, fetchDashboardData]);

  return (
    <LinearGradient colors={['#EFF6FF', '#F8FAFC']} style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchDashboardData} tintColor="#2563EB" />}
      >
        <Animated.View entering={FadeInDown.delay(100).duration(500)} style={styles.header}>
          {schoolLogo ? (
              <Image source={{ uri: schoolLogo }} style={styles.logoImage} />
          ) : (
              <View style={styles.headerIcon}>
              <Bell color="#2563EB" size={28} />
              </View>
          )}
          <Text style={styles.schoolName} numberOfLines={1}>{schoolName || 'AutoBell Dashboard'}</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200).duration(500)} style={styles.cardContainer}>
            <View style={[styles.card, styles.highlightCard]}>
                <LinearGradient
                    colors={['#2563EB', '#1E40AF']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.cardGradient}
                >
                    <View style={styles.cardHeader}>
                    <Clock color="rgba(255,255,255,0.9)" size={20} />
                    <Text style={[styles.cardTitle, { color: 'rgba(255,255,255,0.9)' }]}>Next Bell</Text>
                    </View>
                    <Text style={[styles.bigText, { color: 'white' }]}>{nextBell || '--:--'}</Text>
                </LinearGradient>
            </View>

            <View style={styles.card}>
                <View style={styles.cardHeader}>
                <Calendar color="#64748b" size={20} />
                <Text style={styles.cardTitle}>Active Profile</Text>
                </View>
                <Text style={styles.profileText}>{activeProfile}</Text>
                <TouchableOpacity 
                style={styles.changeButton}
                onPress={() => navigation.navigate('ProfileSwitcher')}
                >
                <Text style={styles.buttonText}>Change Profile</Text>
                </TouchableOpacity>
            </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(500)} style={styles.actionsGrid}>
          <TouchableOpacity 
            style={[styles.actionButton, styles.manualButton]}
            onPress={() => navigation.navigate('ManualTrigger')}
          >
            <Zap color="white" size={28} style={{ marginBottom: 8 }} />
            <Text style={styles.actionButtonText}>Manual Trigger</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionButton, styles.emergencyButton]}
            onPress={() => navigation.navigate('Emergency')}
          >
            <AlertTriangle color="white" size={28} style={{ marginBottom: 8 }} />
            <Text style={styles.actionButtonText}>EMERGENCY</Text>
          </TouchableOpacity>
        </Animated.View>
        
        <Animated.View entering={FadeInDown.delay(400).duration(500)}>
            <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.logoutButton}>
                <LogOut color="#94a3b8" size={20} style={{ marginRight: 8 }} />
                <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 60,
  },
  header: {
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  logoImage: {
    width: 48,
    height: 48,
    marginRight: 12,
    borderRadius: 24,
    backgroundColor: 'white',
  },
  schoolName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e293b',
    flex: 1,
  },
  cardContainer: {
    marginBottom: 24,
    gap: 16,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#64748b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 3,
  },
  highlightCard: {
    padding: 0,
    overflow: 'hidden',
  },
  cardGradient: {
    padding: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    marginLeft: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigText: {
    fontSize: 42,
    fontWeight: '800',
    color: '#0f172a',
  },
  profileText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 16,
  },
  changeButton: {
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  buttonText: {
    color: '#2563EB',
    fontWeight: '600',
    fontSize: 14,
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    gap: 16,
  },
  actionButton: {
    flex: 1,
    padding: 20,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  manualButton: {
    backgroundColor: '#0ea5e9', // Sky blue
  },
  emergencyButton: {
    backgroundColor: '#ef4444', // Red
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 4,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 32,
  },
  logoutText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
});
