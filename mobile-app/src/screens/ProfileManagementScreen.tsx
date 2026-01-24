import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, ActivityIndicator, TextInput, Modal } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Trash2, ChevronRight, X } from 'lucide-react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

type BellProfile = {
  id: string;
  name: string;
};

export default function ProfileManagementScreen() {
  const { schoolId } = useAuth();
  const navigation = useNavigation<any>();
  const [profiles, setProfiles] = useState<BellProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');

  const fetchProfiles = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bell_profiles')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setProfiles((data ?? []) as BellProfile[]);
    } catch (error) {
      console.error('Error fetching profiles:', error);
      Alert.alert('Error', 'Failed to load profiles');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfiles();
    }, [schoolId])
  );

  const handleCreateProfile = async () => {
    if (!newProfileName.trim()) return;

    try {
      const { data, error } = await supabase
        .from('bell_profiles')
        .insert({
          name: newProfileName,
          school_id: schoolId
        })
        .select()
        .single();

      if (error) throw error;

      setCreateModalVisible(false);
      setNewProfileName('');
      fetchProfiles();
      // Optional: Navigate to editor immediately
      // navigation.navigate('ProfileEditor', { profileId: data.id, profileName: data.name });
    } catch (error: any) {
      console.error('Create profile error:', error);
      Alert.alert('Error', 'Failed to create profile');
    }
  };

  const handleDeleteProfile = (profile: BellProfile) => {
    Alert.alert(
      'Delete Profile',
      `Are you sure you want to delete "${profile.name}"? This will delete all associated schedules.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete times first (cascade usually handles this, but let's be safe if no cascade)
              // Actually bell_times usually has ON DELETE CASCADE on profile_id
              const { error } = await supabase
                .from('bell_profiles')
                .delete()
                .eq('id', profile.id);

              if (error) throw error;
              fetchProfiles();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to delete profile');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: BellProfile }) => (
    <TouchableOpacity 
      style={styles.card}
      onPress={() => navigation.navigate('ProfileEditor', { profileId: item.id, profileName: item.name })}
    >
      <View style={styles.cardContent}>
        <Text style={styles.profileName}>{item.name}</Text>
        <ChevronRight color="#9CA3AF" size={20} />
      </View>
      <TouchableOpacity 
        style={styles.deleteButton}
        onPress={() => handleDeleteProfile(item)}
      >
        <Trash2 color="#EF4444" size={20} />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profiles</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setCreateModalVisible(true)}
        >
          <Plus size={20} color="#fff" />
          <Text style={styles.addButtonText}>New Profile</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={profiles}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No profiles found</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={createModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Profile</Text>
              <TouchableOpacity onPress={() => setCreateModalVisible(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Profile Name"
              value={newProfileName}
              onChangeText={setNewProfileName}
              autoFocus
            />

            <TouchableOpacity 
              style={styles.createButton}
              onPress={handleCreateProfile}
            >
              <Text style={styles.createButtonText}>Create</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  addButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  listContent: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginRight: 16,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  deleteButton: {
    padding: 8,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    color: '#6B7280',
    fontSize: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  createButton: {
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  createButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
