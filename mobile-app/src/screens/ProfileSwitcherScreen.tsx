import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, Calendar, ArrowRight } from 'lucide-react-native';

type Profile = {
  id: string;
  name: string;
};

export default function ProfileSwitcherScreen() {
  const { schoolId } = useAuth();
  const navigation = useNavigation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (schoolId) {
      fetchProfiles();
      loadActiveProfile();
    }
  }, [schoolId]);

  const loadActiveProfile = async () => {
    const id = await AsyncStorage.getItem(`school_${schoolId}_activeProfileId`);
    setActiveProfileId(id);
  };

  const fetchProfiles = async () => {
    if (!schoolId) return;
    try {
      const { data } = await supabase
        .from('bell_profiles')
        .select('id, name')
        .eq('school_id', schoolId)
        .order('name');

      if (data) setProfiles(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const activateProfile = async (profile: Profile) => {
    if (!schoolId) return;

    await AsyncStorage.setItem(`school_${schoolId}_activeProfileId`, profile.id);
    await AsyncStorage.setItem(`school_${schoolId}_dashboard_activeProfile`, profile.name);
    setActiveProfileId(profile.id);

    const channel = supabase.channel(`school:${schoolId}`);
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'profile_change',
          payload: { 
            profile_id: profile.id,
            profile_name: profile.name 
          },
        });
        
        Alert.alert('Success', `Active profile changed to: ${profile.name}`, [
            { text: 'OK', onPress: () => navigation.goBack() }
        ]);
        supabase.removeChannel(channel);
      }
    });
  };

  const renderItem = ({ item }: { item: Profile }) => {
    const isActive = item.id === activeProfileId;
    return (
      <TouchableOpacity 
        style={[styles.item, isActive && styles.activeItem]} 
        onPress={() => activateProfile(item)}
      >
        <View style={styles.itemContent}>
          <View style={[styles.iconContainer, isActive ? styles.activeIcon : styles.inactiveIcon]}>
            <Calendar color={isActive ? "white" : "#64748b"} size={24} />
          </View>
          <Text style={[styles.itemText, isActive && styles.activeText]}>{item.name}</Text>
        </View>
        {isActive ? (
          <View style={styles.checkContainer}>
            <Check color="#10b981" size={20} />
          </View>
        ) : (
          <ArrowRight color="#cbd5e1" size={20} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>Select Active Profile</Text>
      <Text style={styles.headerSubtitle}>Tap a profile to activate it immediately</Text>

      {loading ? (
        <ActivityIndicator size="large" color="#2563EB" />
      ) : (
        <FlatList
          data={profiles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No profiles found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8fafc',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  activeItem: {
    borderColor: '#2563EB',
    backgroundColor: '#eff6ff',
  },
  itemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  inactiveIcon: {
    backgroundColor: '#f1f5f9',
  },
  activeIcon: {
    backgroundColor: '#2563EB',
  },
  itemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#334155',
  },
  activeText: {
    color: '#1e293b',
    fontWeight: '700',
  },
  checkContainer: {
    backgroundColor: '#d1fae5',
    padding: 4,
    borderRadius: 12,
  },
  selectText: {
    color: '#3498db',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#94a3b8',
    fontSize: 16,
  },
});
