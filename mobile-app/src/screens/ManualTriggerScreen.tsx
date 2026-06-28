import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
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
          // Payload isn't used by ESP32 yet for RING, but storing it for context
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
      
      {loading ? (
        <ActivityIndicator size="large" />
      ) : (
        <FlatList
          data={audioFiles}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.emptyText}>No audio files found.</Text>}
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
  subText: {
    color: '#888',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
});
