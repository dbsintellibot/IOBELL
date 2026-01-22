import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { session, schoolId } = useAuth();
  const [nextBell, setNextBell] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<string>('Loading...');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    if (schoolId) {
      loadCachedData();
      fetchDashboardData();
    }
  }, [schoolId]);

  const loadCachedData = async () => {
    if (!schoolId) return;
    try {
      const cachedProfile = await AsyncStorage.getItem(`school_${schoolId}_dashboard_activeProfile`);
      const cachedNextBell = await AsyncStorage.getItem(`school_${schoolId}_dashboard_nextBell`);
      if (cachedProfile) setActiveProfile(cachedProfile);
      if (cachedNextBell) setNextBell(cachedNextBell);
    } catch (e) {
      // ignore error
    }
  };

  const fetchDashboardData = async () => {
    if (!schoolId) return;
    setRefreshing(true);
    try {
      // 2. Get Profiles
      const { data: profiles } = await supabase
        .from('bell_profiles')
        .select('*')
        .eq('school_id', schoolId);
      
      if (profiles && profiles.length > 0) {
        // logic to determine active profile would go here. 
        // For now, just pick the first one or one named 'Normal'
        const normal = profiles.find(p => p.name === 'Normal Day') || profiles[0];
        setActiveProfile(normal.name);
        AsyncStorage.setItem(`school_${schoolId}_dashboard_activeProfile`, normal.name);

        // 3. Get Next Bell for this profile
        const { data: bells } = await supabase
            .from('bell_times')
            .select('bell_time')
            .eq('profile_id', normal.id)
            .order('bell_time', { ascending: true });
            
        if (bells) {
            // Find next bell based on current time
            const now = new Date();
            const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:00`;
            const next = bells.find(b => b.bell_time > currentTime);
            const nextBellTime = next ? next.bell_time : 'No more bells today';
            setNextBell(nextBellTime);
            AsyncStorage.setItem(`school_${schoolId}_dashboard_nextBell`, nextBellTime);
        }
      } else {
        setActiveProfile('No Profiles');
        setNextBell('--:--');
      }

    } catch (error) {
      console.error(error);
      if (activeProfile === 'Loading...') setActiveProfile('Error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScrollView 
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchDashboardData} />}
    >
      <View style={styles.header}>
        <Text style={styles.schoolName}>AutoBell Dashboard</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Next Bell</Text>
        <Text style={styles.bigText}>{nextBell || '--:--'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Active Profile</Text>
        <Text style={styles.profileText}>{activeProfile}</Text>
        <TouchableOpacity 
          style={styles.changeButton}
          onPress={() => navigation.navigate('ProfileSwitcher')}
        >
          <Text style={styles.buttonText}>Change Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.actionsGrid}>
        <TouchableOpacity 
          style={[styles.actionButton, styles.manualButton]}
          onPress={() => navigation.navigate('ManualTrigger')}
        >
          <Text style={styles.actionButtonText}>Manual Trigger</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.actionButton, styles.emergencyButton]}
          onPress={() => navigation.navigate('Emergency')}
        >
          <Text style={styles.actionButtonText}>EMERGENCY</Text>
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity onPress={() => supabase.auth.signOut()} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#f5f5f5',
    flexGrow: 1,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  schoolName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardTitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  bigText: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  profileText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#27ae60',
    marginBottom: 10,
  },
  changeButton: {
    backgroundColor: '#3498db',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 5,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionButton: {
    flex: 0.48,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    elevation: 2,
  },
  manualButton: {
    backgroundColor: '#f39c12',
  },
  emergencyButton: {
    backgroundColor: '#c0392b',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  logoutButton: {
      marginTop: 20,
      alignSelf: 'center',
  },
  logoutText: {
      color: 'gray',
  }
});
