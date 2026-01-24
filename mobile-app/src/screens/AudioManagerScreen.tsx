import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import { Play, Pause, Trash2, Upload, Music, Loader2 } from 'lucide-react-native';

type AudioFileRecord = {
  id: string;
  name: string;
  storage_path: string;
  created_at: string;
  duration: number | null;
  school_id: string;
};

type AudioFileItem = AudioFileRecord & {
  url: string;
  size: string;
};

export default function AudioManagerScreen() {
  const { schoolId } = useAuth();
  const [files, setFiles] = useState<AudioFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(() => {
    fetchFiles();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [schoolId]);

  const fetchFiles = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('audio_files')
        .select('*')
        .eq('school_id', schoolId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const records = (data ?? []) as AudioFileRecord[];
      const filesWithUrls = records.map(file => {
        const { data: { publicUrl } } = supabase.storage.from('audio-files').getPublicUrl(file.storage_path);
        return {
          ...file,
          url: publicUrl,
          size: 'Unknown'
        };
      });

      setFiles(filesWithUrls);
    } catch (error) {
      console.error('Error fetching files:', error);
      Alert.alert('Error', 'Failed to load audio files');
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = async (id: string, url: string) => {
    try {
      if (playingId === id && sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
        setPlayingId(null);
        return;
      }

      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: url },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingId(id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingId(null);
          newSound.unloadAsync();
          setSound(null);
        }
      });

    } catch (error) {
      console.error('Error playing sound:', error);
      Alert.alert('Error', 'Failed to play audio');
    }
  };

  const handleUpload = async () => {
    if (!schoolId) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      setUploading(true);

      // 1. Prepare file for upload
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${schoolId}/${fileName}`;

      // Use fetch to get blob
      const response = await fetch(file.uri);
      const blob = await response.blob();

      // 2. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('audio-files')
        .upload(filePath, blob);

      if (uploadError) throw uploadError;

      // 3. Insert into Database
      const { error: dbError } = await supabase
        .from('audio_files')
        .insert({
          name: file.name,
          storage_path: filePath,
          school_id: schoolId,
          duration: 0
        });

      if (dbError) throw dbError;

      Alert.alert('Success', 'File uploaded successfully');
      fetchFiles();

    } catch (error: any) {
      console.error('Upload error:', error);
      Alert.alert('Error', error.message || 'Failed to upload file');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (file: AudioFileItem) => {
    Alert.alert(
      'Delete File',
      `Are you sure you want to delete "${file.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Delete from Storage
              await supabase.storage.from('audio-files').remove([file.storage_path]);

              // 2. Delete from Database
              const { error } = await supabase
                .from('audio_files')
                .delete()
                .eq('id', file.id);

              if (error) throw error;

              fetchFiles();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Failed to delete file');
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }: { item: AudioFileItem }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.iconContainer}>
          <Music color="#2563EB" size={24} />
        </View>
        <View style={styles.fileInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
        </View>
      </View>
      
      <View style={styles.cardActions}>
        <TouchableOpacity 
          onPress={() => handlePlay(item.id, item.url)}
          style={styles.actionButton}
        >
          {playingId === item.id ? (
            <Pause color="#4B5563" size={20} />
          ) : (
            <Play color="#4B5563" size={20} />
          )}
        </TouchableOpacity>
        
        <TouchableOpacity 
          onPress={() => handleDelete(item)}
          style={styles.deleteButton}
        >
          <Trash2 color="#EF4444" size={20} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Audio Manager</Text>
        <TouchableOpacity 
          onPress={handleUpload}
          disabled={uploading}
          style={[styles.uploadButton, uploading && styles.disabledButton]}
        >
          {uploading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Upload color="#fff" size={16} />
              <Text style={styles.uploadButtonText}>Upload</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={files}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No audio files found</Text>
            </View>
          }
        />
      )}
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
  uploadButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  listContent: {
    gap: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  fileDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    padding: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
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
});
