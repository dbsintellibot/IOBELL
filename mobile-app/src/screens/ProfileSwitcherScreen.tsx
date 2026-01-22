import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useNavigation } from '@react-navigation/native';

type Profile = {
  id: string;
  name: string;
};

export default function ProfileSwitcherScreen() {
  const { session, schoolId } = useAuth();
  const navigation = useNavigation();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (schoolId) fetchProfiles();
  }, [schoolId]);

  const fetchProfiles = async () => {
    if (!schoolId) return;
    try {
      const { data } = await supabase
        .from('bell_profiles')
        .select('*')
        .eq('school_id', schoolId);

      if (data) setProfiles(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const activateProfile = async (profile: Profile) => {
    if (!schoolId) return;

    // In a real app, we would update the school's active profile in the database
    // For example: await supabase.from('schools').update({ active_profile_id: profile.id }).eq('id', schoolId);
    
    // We also need to notify devices to sync the new schedule
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
        
        Alert.alert('Profile Changed', `Active profile is now: ${profile.name}`, [
            { text: 'OK', onPress: () => navigation.goBack() }
        ]);
        supabase.removeChannel(channel);
      }
    });
  };

  const renderItem = ({ item }: { item: Profile }) => (
    <TouchableOpacity style={styles.item} onPress={() => activateProfile(item)}>
      <Text style={styles.itemText}>{item.name}</Text>
      <Text style={styles.selectText}>Select</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Active Profile</Text>
      <Text style={styles.subtitle}>This will update the schedule for today</Text>

      {loading ? (
        <ActivityIndicator size="large" />
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
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  itemText: {
    fontSize: 18,
    fontWeight: '500',
  },
  selectText: {
    color: '#3498db',
    fontWeight: 'bold',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
});
