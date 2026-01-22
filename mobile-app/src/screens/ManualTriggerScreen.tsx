import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

type AudioFile = {
  id: string;
  name: string;
  storage_path: string;
  duration: number;
};

export default function ManualTriggerScreen() {
  const { session, schoolId } = useAuth();
  const [audioFiles, setAudioFiles] = useState<AudioFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (schoolId) {
        loadCachedData();
        fetchAudioFiles();
    }
  }, [schoolId]);

  const loadCachedData = async () => {
    if (!schoolId) return;
    try {
      const cached = await AsyncStorage.getItem(`school_${schoolId}_manual_audioFiles`);
      if (cached) setAudioFiles(JSON.parse(cached));
    } catch (e) {
      // ignore
    }
  };

  const fetchAudioFiles = async () => {
    if (!schoolId) return;
    try {
      const { data } = await supabase
        .from('audio_files')
        .select('*')
        .eq('school_id', schoolId);

      if (data) {
        setAudioFiles(data);
        AsyncStorage.setItem(`school_${schoolId}_manual_audioFiles`, JSON.stringify(data));
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const playAudio = async (audio: AudioFile) => {
    if (!schoolId) return;
    
    // Broadcast message via Supabase Realtime
    const channel = supabase.channel(`school:${schoolId}`);
    
    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.send({
          type: 'broadcast',
          event: 'manual_ring',
          payload: { 
            audio_url: supabase.storage.from('audio-files').getPublicUrl(audio.storage_path).data.publicUrl,
            duration: audio.duration,
            name: audio.name 
          },
        });
        
        Alert.alert('Sent', `Command to play "${audio.name}" sent.`);
        supabase.removeChannel(channel);
      }
    });
  };

  const renderItem = ({ item }: { item: AudioFile }) => (
    <TouchableOpacity style={styles.item} onPress={() => playAudio(item)}>
      <Text style={styles.itemText}>{item.name}</Text>
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
