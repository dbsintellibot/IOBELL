import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { Plus, Save, Clock, Music, Calendar, X, Trash2 } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';

type AudioFileItem = {
  id: string;
  name: string;
};

type ScheduleItem = {
  id: string;
  bell_time: string;
  audio_file_id: string | null;
  day_of_week: number;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProfileEditorScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation();
  const { profileId, profileName } = route.params;

  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedDay, setSelectedDay] = useState(new Date().getDay());
  const [isDirty, setIsDirty] = useState(false);

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<ScheduleItem | null>(null);
  const [tempTime, setTempTime] = useState(new Date());
  const [tempAudioId, setTempAudioId] = useState<string | null>(null);
  const [tempDays, setTempDays] = useState<number[]>([]);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    fetchData();
  }, [profileId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Audio Files
      const { data: audioData } = await supabase
        .from('audio_files')
        .select('id, name')
        .order('name');
      
      setAudioFiles(audioData as AudioFileItem[] || []);

      // Fetch Schedule
      const { data: scheduleData } = await supabase
        .from('bell_times')
        .select('id, bell_time, day_of_week, audio_file_id')
        .eq('profile_id', profileId);

      const items: ScheduleItem[] = [];
      (scheduleData || []).forEach((row: any) => {
        const days = Array.isArray(row.day_of_week) ? row.day_of_week : [row.day_of_week];
        days.forEach((day: number) => {
            items.push({
                id: `${row.id}-${day}`, // Generate unique ID for frontend
                bell_time: row.bell_time,
                audio_file_id: row.audio_file_id,
                day_of_week: day
            });
        });
      });
      
      setSchedule(items);
      setIsDirty(false);
    } catch (error) {
      console.error('Error fetching data:', error);
      Alert.alert('Error', 'Failed to load profile data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      // 1. Delete existing times
      const { error: deleteError } = await supabase
        .from('bell_times')
        .delete()
        .eq('profile_id', profileId);
      
      if (deleteError) throw deleteError;

      // 2. Insert new times
      // Group by unique time+audio+days to optimize (optional, but good practice)
      // For now, simple insert per item is fine but `bell_times` usually expects `day_of_week` array if we want to be efficient.
      // However, the web app sends individual items? No, web app logic:
      // const itemsToInsert = localSchedule.map(...) where day_of_week is [item.day_of_week]
      // Wait, web app logic:
      /*
        const itemsToInsert = localSchedule.map(item => ({
            bell_time: item.bell_time,
            audio_file_id: item.audio_file_id,
            day_of_week: [item.day_of_week],
            profile_id: selectedProfileId
        }))
      */
      // So it inserts one row per day-time combination. That's fine.

      const itemsToInsert = schedule.map(item => ({
        bell_time: item.bell_time.slice(0, 5), // Ensure HH:MM format
        audio_file_id: item.audio_file_id,
        day_of_week: [item.day_of_week],
        profile_id: profileId
      }));

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('bell_times')
          .insert(itemsToInsert);
        
        if (insertError) throw insertError;
      }

      setIsDirty(false);
      Alert.alert('Success', 'Profile saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setEditingItem(null);
    const now = new Date();
    now.setSeconds(0);
    now.setMilliseconds(0);
    setTempTime(now);
    setTempAudioId(audioFiles[0]?.id || null);
    setTempDays([selectedDay]);
    setModalVisible(true);
  };

  const openEditModal = (item: ScheduleItem) => {
    setEditingItem(item);
    const [hours, minutes] = item.bell_time.split(':').map(Number);
    const date = new Date();
    date.setHours(hours);
    date.setMinutes(minutes);
    date.setSeconds(0);
    setTempTime(date);
    setTempAudioId(item.audio_file_id);
    setTempDays([item.day_of_week]); // Editing usually is for a single instance in this view
    setModalVisible(true);
  };

  const handleSaveItem = () => {
    const timeStr = tempTime.toTimeString().slice(0, 5); // HH:MM
    
    if (editingItem) {
      // Update existing item
      // Note: In "expanded" view, we are editing a specific day's instance.
      // If user selected multiple days in edit, we might be creating new items or moving it.
      // Simplify: Edit affects only the specific item(s) being edited.
      // Actually, for "Edit", allowing day change is tricky in this UI.
      // Let's assume Edit only changes Time and Audio.
      // If they want to change Day, they delete and add new? 
      // Or we allow changing days, which means removing old item and adding new ones.
      
      const newItems = schedule.filter(i => i.id !== editingItem.id);
      
      tempDays.forEach(day => {
        newItems.push({
          id: `temp-${Date.now()}-${day}`,
          bell_time: timeStr,
          audio_file_id: tempAudioId,
          day_of_week: day
        });
      });
      
      setSchedule(newItems);
    } else {
      // Add new items for all selected days
      const newItems = [...schedule];
      tempDays.forEach(day => {
        newItems.push({
          id: `new-${Date.now()}-${day}`,
          bell_time: timeStr,
          audio_file_id: tempAudioId,
          day_of_week: day
        });
      });
      setSchedule(newItems);
    }
    
    setIsDirty(true);
    setModalVisible(false);
  };

  const handleDeleteItem = (id: string) => {
    setSchedule(prev => prev.filter(i => i.id !== id));
    setIsDirty(true);
  };

  const toggleDay = (dayIndex: number) => {
    if (tempDays.includes(dayIndex)) {
        if (tempDays.length > 1) {
            setTempDays(prev => prev.filter(d => d !== dayIndex));
        }
    } else {
        setTempDays(prev => [...prev, dayIndex].sort());
    }
  };

  const currentDaySchedule = useMemo(() => {
    return schedule
        .filter(item => item.day_of_week === selectedDay)
        .sort((a, b) => a.bell_time.localeCompare(b.bell_time));
  }, [schedule, selectedDay]);

  const renderScheduleItem = ({ item }: { item: ScheduleItem }) => {
    const audioName = audioFiles.find(f => f.id === item.audio_file_id)?.name || 'Default';
    return (
      <TouchableOpacity 
        style={styles.itemCard}
        onPress={() => openEditModal(item)}
      >
        <View style={styles.itemInfo}>
          <View style={styles.timeContainer}>
            <Clock size={16} color="#4B5563" />
            <Text style={styles.timeText}>{item.bell_time.slice(0, 5)}</Text>
          </View>
          <View style={styles.audioContainer}>
            <Music size={14} color="#6B7280" />
            <Text style={styles.audioText} numberOfLines={1}>{audioName}</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => handleDeleteItem(item.id)}
        >
          <Trash2 size={18} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  React.useLayoutEffect(() => {
    navigation.setOptions({
      title: profileName || 'Edit Profile',
      headerRight: () => (
        <TouchableOpacity 
          onPress={handleSaveProfile} 
          disabled={!isDirty || saving}
          style={{ marginRight: 16, opacity: (!isDirty || saving) ? 0.5 : 1 }}
        >
          {saving ? <ActivityIndicator color="#2563EB" /> : <Text style={{ color: '#2563EB', fontWeight: '600', fontSize: 16 }}>Save</Text>}
        </TouchableOpacity>
      ),
    });
  }, [navigation, isDirty, saving, profileName, schedule]);

  return (
    <View style={styles.container}>
      {/* Day Selector */}
      <View style={styles.daySelector}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayList}>
          {DAYS.map((day, index) => (
            <TouchableOpacity
              key={day}
              style={[styles.dayChip, selectedDay === index && styles.selectedDayChip]}
              onPress={() => setSelectedDay(index)}
            >
              <Text style={[styles.dayChipText, selectedDay === index && styles.selectedDayChipText]}>
                {day.slice(0, 3)}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Schedule List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={currentDaySchedule}
          renderItem={renderScheduleItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No bells scheduled for {DAYS[selectedDay]}</Text>
            </View>
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity 
        style={styles.fab}
        onPress={openAddModal}
      >
        <Plus color="#fff" size={24} />
      </TouchableOpacity>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingItem ? 'Edit Bell' : 'Add Bell'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {/* Time Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Time</Text>
                {Platform.OS === 'android' ? (
                  <TouchableOpacity 
                    style={styles.timeButton}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Text style={styles.timeButtonText}>
                      {tempTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                    </Text>
                  </TouchableOpacity>
                ) : (
                    <DateTimePicker
                        value={tempTime}
                        mode="time"
                        display="spinner"
                        onChange={(e, date) => date && setTempTime(date)}
                    />
                )}
                {showTimePicker && (
                  <DateTimePicker
                    value={tempTime}
                    mode="time"
                    display="default"
                    is24Hour={true}
                    onChange={(e, date) => {
                      setShowTimePicker(false);
                      if (date) setTempTime(date);
                    }}
                  />
                )}
              </View>

              {/* Audio Picker */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Audio File</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={tempAudioId}
                    onValueChange={(itemValue) => setTempAudioId(itemValue)}
                  >
                    <Picker.Item label="Select audio..." value={null} />
                    {audioFiles.map(file => (
                      <Picker.Item key={file.id} label={file.name} value={file.id} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Days Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Days</Text>
                <View style={styles.daysGrid}>
                  {DAYS.map((day, index) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dayOption,
                        tempDays.includes(index) && styles.selectedDayOption
                      ]}
                      onPress={() => toggleDay(index)}
                    >
                      <Text style={[
                        styles.dayOptionText,
                        tempDays.includes(index) && styles.selectedDayOptionText
                      ]}>
                        {day.slice(0, 3)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleSaveItem}
              >
                <Text style={styles.saveButtonText}>
                  {editingItem ? 'Update Bell' : 'Add Bell'}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

import { Platform } from 'react-native';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  daySelector: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dayList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  dayChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedDayChip: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  dayChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  selectedDayChipText: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 80, // For FAB
  },
  itemCard: {
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
  itemInfo: {
    flex: 1,
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  timeText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  audioContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioText: {
    fontSize: 14,
    color: '#6B7280',
  },
  deleteButton: {
    padding: 8,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
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
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
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
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  timeButton: {
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  timeButtonText: {
    fontSize: 18,
    color: '#1F2937',
    fontWeight: '500',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    overflow: 'hidden',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  dayOption: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  selectedDayOption: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  dayOptionText: {
    fontSize: 14,
    color: '#4B5563',
  },
  selectedDayOptionText: {
    color: '#fff',
  },
  saveButton: {
    backgroundColor: '#2563EB',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
