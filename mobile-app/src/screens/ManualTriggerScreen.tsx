import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Bell } from 'lucide-react-native';
import SecureStorage from '../utils/SecureStorage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type AudioFile = {
  id: string;
  name: string;
  storage_path: string;
  duration: number;
};

export default function ManualTriggerScreen() {
  const { schoolId } = useAuth();
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCachedData = React.useCallback(async () => {
    if (!schoolId) return;
    try {
      const cached = await SecureStorage.getItem(`school_${schoolId}_manual_audioFiles`);
      if (cached) setAudioFiles(JSON.parse(cached));
    } catch (e) {
      console.log(e);
    }
  }, [schoolId]);

  const fetchAudioFiles = React.useCallback(async () => {
    if (!schoolId) return;
    try {
      const { data } = await supabase
        .from('audio_files')
        .select('id, name, storage_path, duration')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (data) {
        setAudioFiles(data as AudioFile[]);
        SecureStorage.setItem(`school_${schoolId}_manual_audioFiles`, JSON.stringify(data));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (schoolId) {
        loadCachedData();
        fetchAudioFiles();
    }
  }, [schoolId, loadCachedData, fetchAudioFiles]);

  const quickRingBell = async () => {
    if (!schoolId) return;
    try {
      const { data: devices } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId);

      if (devices && devices.length > 0) {
        const commands = devices.map(d => ({
          device_id: d.id,
          school_id: schoolId,
          command: 'RING',
          payload: { duration: 5, name: 'Quick Manual Ring' },
          status: 'pending'
        }));

        const { error } = await supabase
          .from('command_queue')
          .insert(commands);

        if (error) throw error;
        Alert.alert('Success', `Manual ring command queued for ${devices.length} device(s).`);
      } else {
        Alert.alert('Error', 'No devices found for this school.');
      }
    } catch (error: any) {
      console.error('Error triggering manual ring:', error);
      Alert.alert('Error', error?.message || 'Failed to trigger manual ring.');
    }
  };

  const playAudio = async (audio: AudioFile) => {
    if (!schoolId) return;
    
    try {
      // Fetch devices first
      const { data: devices } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId);

      if (devices && devices.length > 0) {
        const commands = devices.map(d => ({
          device_id: d.id,
          school_id: schoolId,
          command: 'RING',
          // Payload stores audio details
          payload: { 
            url: supabase.storage.from('audio-files').getPublicUrl(audio.storage_path).data.publicUrl,
            audio_url: supabase.storage.from('audio-files').getPublicUrl(audio.storage_path).data.publicUrl,
            duration: audio.duration,
            name: audio.name
          },
          status: 'pending'
        }));

        const { error } = await supabase
          .from('command_queue')
          .insert(commands);
          
        if (error) throw error;
        
        Alert.alert('Sent', `Command to play "${audio.name}" queued for ${devices.length} device(s).`);
      } else {
        Alert.alert('Error', 'No devices found for this school.');
      }
    } catch (error) {
      console.error('Error sending command:', error);
      Alert.alert('Error', 'Failed to send command.');
    }
  };

  const renderItem = ({ item }: { item: AudioFile }) => (
    <TouchableOpacity
      style={styles.item}
      onPress={() =>
        Alert.alert(
          'Confirm Manual Trigger',
          `Continue to play "${item.name}" immediately on all devices in this school?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Continue And Ring Now',
              style: 'destructive',
              onPress: () => playAudio(item),
            },
          ]
        )
      }
    >
      <Text style={styles.itemText}>
        {item.name}
      </Text>
      <Text style={styles.subText}>{item.duration}s</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manual Bell Trigger</Text>
      <Text style={styles.subtitle}>Tap to ring immediately</Text>

      {/* Universal Quick Ring Hero Card */}
      <TouchableOpacity
        style={styles.quickRingCard}
        onPress={() =>
          Alert.alert(
            'Confirm Manual Ring',
            'Ring the bell immediately for 5 seconds on all school devices?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Ring Bell Now',
                style: 'destructive',
                onPress: quickRingBell,
              },
            ]
          )
        }
      >
        <View style={styles.quickRingIconBg}>
          <Bell size={24} color="#D97706" />
        </View>
        <View style={styles.quickRingContent}>
          <Text style={styles.quickRingTitle}>Quick Ring Bell (5s)</Text>
          <Text style={styles.quickRingSubtitle}>Triggers 5s relay pulse or primary bell</Text>
        </View>
      </TouchableOpacity>
      
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={audioFiles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No custom audio tracks found.</Text>}
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
    marginBottom: 16,
    textAlign: 'center',
  },
  quickRingCard: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  quickRingIconBg: {
    backgroundColor: '#FDE68A',
    borderRadius: 8,
    padding: 10,
    marginRight: 14,
  },
  quickRingContent: {
    flex: 1,
  },
  quickRingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#92400E',
  },
  quickRingSubtitle: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  list: {
    paddingBottom: 20,
  },
  item: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 1,
  },
  itemText: {
    fontSize: 16,
    fontWeight: '500',
  },
  subText: {
    color: '#888',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
});
