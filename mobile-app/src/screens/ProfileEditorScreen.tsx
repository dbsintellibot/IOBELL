import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, StyleSheet, Modal, ScrollView, ActivityIndicator, Platform, TextInput } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Plus, Clock, Music, X, Trash2, Type } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import TimeFormat from '../utils/timeFormat';

type AudioFileItem = {
  id: string;
  name: string;
  track_number: number | null;
};

type ScheduleItem = {
  id: string;
  bell_time: string;
  audio_file_id: string | null;
  audio_file_id_2: string | null;
  delay_seconds: number;
  day_of_week: number;
  play_type: 'mp3' | 'tts';
  tts_message: string | null;
};

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function ProfileEditorScreen() {
  const { schoolId } = useAuth();
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
  const [tempAudioId2, setTempAudioId2] = useState<string | null>(null);
  const [tempDelay, setTempDelay] = useState<number>(0);
  const [tempDays, setTempDays] = useState<number[]>([]);
  const [tempPlayType, setTempPlayType] = useState<'mp3' | 'tts'>('mp3');
  const [tempTtsMessage, setTempTtsMessage] = useState<string>('');
  const [showTimePicker, setShowTimePicker] = useState(false);

  const fetchData = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data: audioData } = await supabase
        .from('audio_files')
        .select('id, name, track_number')
        .order('track_number', { ascending: true })
        .order('name');
      
      setAudioFiles((audioData as AudioFileItem[]) || []);

      // Fetch Schedule
      const { data: scheduleData } = await supabase
        .from('bell_times')
        .select('id, bell_time, day_of_week, audio_file_id, audio_file_id_2, delay_seconds, play_type, tts_message')
        .eq('profile_id', profileId);

      const items: ScheduleItem[] = [];
      (scheduleData || []).forEach((row: any) => {
        const days = Array.isArray(row.day_of_week) ? row.day_of_week : [row.day_of_week];
        days.forEach((day: number) => {
            items.push({
                id: `${row.id}-${day}`, // Generate unique ID for frontend
                bell_time: TimeFormat.to12Hour(row.bell_time),
                audio_file_id: row.audio_file_id,
                audio_file_id_2: row.audio_file_id_2,
                delay_seconds: row.delay_seconds || 0,
                // DB (7=Sun) -> UI (0=Sun)
                day_of_week: day === 7 ? 0 : day,
                play_type: row.play_type || 'mp3',
                tts_message: row.tts_message
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
  }, [profileId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Time format functions replaced with unified TimeFormat utility

  const handleSaveProfile = React.useCallback(async () => {
    setSaving(true);
    try {
      // 1. Delete existing times
      const { error: deleteError } = await supabase
        .from('bell_times')
        .delete()
        .eq('profile_id', profileId);
      
      if (deleteError) throw deleteError;

      // 2. Insert new times
      const itemsToInsert = schedule.map(item => ({
        bell_time: TimeFormat.to24Hour(item.bell_time),
        audio_file_id: item.audio_file_id,
        audio_file_id_2: item.audio_file_id_2,
        delay_seconds: item.delay_seconds,
        // UI (0=Sun) -> DB (7=Sun)
        day_of_week: [item.day_of_week === 0 ? 7 : item.day_of_week],
        profile_id: profileId,
        play_type: item.play_type,
        tts_message: item.tts_message
      }));

      if (itemsToInsert.length > 0) {
        const { error: insertError } = await supabase
          .from('bell_times')
          .insert(itemsToInsert);
        
        if (insertError) throw insertError;
      }

      // 3. Trigger ESP32 Sync via Command Queue
      if (schoolId) {
        const { data: devices } = await supabase
          .from('bell_devices')
          .select('id')
          .eq('school_id', schoolId);

        if (devices && devices.length > 0) {
          const commands = devices.map(d => ({
            device_id: d.id,
            school_id: schoolId,
            command: 'CONFIG',
            payload: { source: 'profile_save' }
          }));
          await supabase.from('command_queue').insert(commands);
        }
      }

      setIsDirty(false);
      Alert.alert('Success', 'Profile saved successfully');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }, [schedule, profileId, schoolId]);

  const openAddModal = () => {
    setEditingItem(null);
    const now = new Date();
    now.setSeconds(0);
    now.setMilliseconds(0);
    setTempTime(now);
    setTempAudioId(audioFiles[0]?.id || null);
    setTempAudioId2(null);
    setTempDelay(0);
    setTempDays([selectedDay]);
    setTempPlayType('mp3');
    setTempTtsMessage('');
    setModalVisible(true);
  };

  const openEditModal = (item: ScheduleItem) => {
    setEditingItem(item);
    const date = TimeFormat.parseToDate(item.bell_time);
    setTempTime(date);
    setTempAudioId(item.audio_file_id);
    setTempAudioId2(item.audio_file_id_2);
    setTempDelay(item.delay_seconds);
    setTempDays([item.day_of_week]);
    setTempPlayType(item.play_type);
    setTempTtsMessage(item.tts_message || '');
    setModalVisible(true);
  };

  const handleSaveItem = () => {
    const timeStr = TimeFormat.formatFromDate(tempTime);
    
    // Validation
    if (tempPlayType === 'tts' && !tempAudioId && !tempTtsMessage.trim()) {
        Alert.alert('Validation Error', 'For Text-to-Speech, select an audio file or enter a message.');
        return;
    }

    if (editingItem) {
      const newItems = schedule.filter(i => i.id !== editingItem.id);
      
      tempDays.forEach(day => {
        newItems.push({
          id: `temp-${Date.now()}-${day}`,
          bell_time: timeStr,
          audio_file_id: tempAudioId,
          audio_file_id_2: tempAudioId2,
          delay_seconds: tempDelay,
          day_of_week: day,
          play_type: tempPlayType,
          tts_message: tempPlayType === 'tts' && !tempAudioId ? tempTtsMessage : null
        });
      });
      
      setSchedule(newItems);
    } else {
      const newItems = [...schedule];
      tempDays.forEach(day => {
        newItems.push({
          id: `new-${Date.now()}-${day}`,
          bell_time: timeStr,
          audio_file_id: tempAudioId,
          audio_file_id_2: tempAudioId2,
          delay_seconds: tempDelay,
          day_of_week: day,
          play_type: tempPlayType,
          tts_message: tempPlayType === 'tts' && !tempAudioId ? tempTtsMessage : null
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
        .sort((a, b) => {
            const dateA = TimeFormat.parseToDate(a.bell_time);
            const dateB = TimeFormat.parseToDate(b.bell_time);
            return dateA.getTime() - dateB.getTime();
        });
  }, [schedule, selectedDay]);

  const renderScheduleItem = ({ item }: { item: ScheduleItem }) => {
    const audio1 = audioFiles.find(f => f.id === item.audio_file_id);
    const audio2 = item.audio_file_id_2 ? audioFiles.find(f => f.id === item.audio_file_id_2) : null;
    
    const getLabel = (file: AudioFileItem | undefined) => {
        if (!file) return 'Default';
        return file.track_number ? `[${String(file.track_number).padStart(3, '0')}] ${file.name}` : file.name;
    };

    const audioName = getLabel(audio1);
    const audioName2 = audio2 ? getLabel(audio2) : null;
    const isTts = item.play_type === 'tts';

    return (
      <TouchableOpacity 
        style={styles.itemCard}
        onPress={() => openEditModal(item)}
      >
        <View style={styles.itemInfo}>
          <View style={styles.timeContainer}>
            <Clock size={16} color="#4B5563" />
            <Text style={styles.timeText}>{item.bell_time}</Text>
          </View>
          <View style={styles.audioContainer}>
            {isTts ? <Type size={14} color="#6B7280" /> : <Music size={14} color="#6B7280" />}
            <Text style={styles.audioText} numberOfLines={1}>
                {isTts 
                    ? (item.audio_file_id ? `${audioName} (TTS Audio)` : (item.tts_message || 'No Message'))
                    : `${audioName}${audioName2 ? ` + ${audioName2} (${item.delay_seconds}s)` : ''}`
                }
            </Text>
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
  }, [navigation, isDirty, saving, profileName, schedule, handleSaveProfile]);

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
                      {tempTime.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })}
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
                    is24Hour={false}
                    onChange={(e, date) => {
                      setShowTimePicker(false);
                      if (date) setTempTime(date);
                    }}
                  />
                )}
              </View>

              {/* Seconds Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Seconds</Text>
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={tempTime.getSeconds()}
                    onValueChange={(val) => {
                        const newTime = new Date(tempTime);
                        newTime.setSeconds(val);
                        setTempTime(newTime);
                    }}
                  >
                    {Array.from({length: 60}, (_, i) => i).map(sec => (
                        <Picker.Item key={sec} label={`${sec < 10 ? '0' + sec : sec} seconds`} value={sec} />
                    ))}
                  </Picker>
                </View>
              </View>

              {/* Play Type Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Play Type</Text>
                <View style={styles.typeSelector}>
                    <TouchableOpacity 
                        style={[styles.typeButton, tempPlayType === 'mp3' && styles.selectedTypeButton]}
                        onPress={() => setTempPlayType('mp3')}
                    >
                        <Music size={16} color={tempPlayType === 'mp3' ? '#fff' : '#4B5563'} />
                        <Text style={[styles.typeButtonText, tempPlayType === 'mp3' && styles.selectedTypeButtonText]}>MP3 Audio</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.typeButton, tempPlayType === 'tts' && styles.selectedTypeButton]}
                        onPress={() => {
                            setTempPlayType('tts');
                            setTempAudioId(null); 
                            setTempAudioId2(null);
                        }}
                    >
                        <Type size={16} color={tempPlayType === 'tts' ? '#fff' : '#4B5563'} />
                        <Text style={[styles.typeButtonText, tempPlayType === 'tts' && styles.selectedTypeButtonText]}>Text to Speech</Text>
                    </TouchableOpacity>
                </View>
              </View>

              {tempPlayType === 'mp3' ? (
                  <>
                    {/* Audio Picker 1 */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Audio File 1</Text>
                        <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={tempAudioId}
                            onValueChange={(itemValue) => setTempAudioId(itemValue)}
                        >
                            <Picker.Item label="Select audio..." value={null} />
                            {audioFiles.map(file => (
                            <Picker.Item
                                key={file.id}
                                label={file.track_number ? `[${String(file.track_number).padStart(3, '0')}] ${file.name}` : file.name}
                                value={file.id}
                            />
                            ))}
                        </Picker>
                        </View>
                    </View>

                    {/* Delay Picker */}
                    {tempAudioId2 && (
                        <View style={styles.formGroup}>
                            <Text style={styles.label}>Delay (Seconds)</Text>
                            <View style={styles.pickerContainer}>
                                <Picker
                                    selectedValue={tempDelay}
                                    onValueChange={(val) => setTempDelay(val)}
                                >
                                    {Array.from({length: 31}, (_, i) => i).map(sec => (
                                        <Picker.Item key={sec} label={`${sec} seconds`} value={sec} />
                                    ))}
                                </Picker>
                            </View>
                        </View>
                    )}

                    {/* Audio Picker 2 */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Audio File 2 (Optional)</Text>
                        <View style={styles.pickerContainer}>
                        <Picker
                            selectedValue={tempAudioId2}
                            onValueChange={(itemValue) => setTempAudioId2(itemValue)}
                        >
                            <Picker.Item label="None" value={null} />
                            {audioFiles.map(file => (
                            <Picker.Item
                                key={`2-${file.id}`}
                                label={file.track_number ? `[${String(file.track_number).padStart(3, '0')}] ${file.name}` : file.name}
                                value={file.id}
                            />
                            ))}
                        </Picker>
                        </View>
                    </View>
                  </>
              ) : (
                  <>
                    {/* TTS Configuration */}
                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Audio Override (Optional)</Text>
                        <Text style={styles.helperText}>Select an audio file to play instead of speaking text.</Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={tempAudioId}
                                onValueChange={(val) => {
                                    setTempAudioId(val);
                                    if (val) setTempTtsMessage('');
                                }}
                            >
                                <Picker.Item label="None (Use Text)" value={null} />
                                {audioFiles.map(file => (
                                    <Picker.Item 
                                        key={file.id} 
                                        label={file.track_number ? `[${String(file.track_number).padStart(3, '0')}] ${file.name}` : file.name}
                                        value={file.id} 
                                    />
                                ))}
                            </Picker>
                        </View>
                    </View>

                    <View style={styles.formGroup}>
                        <Text style={styles.label}>Message</Text>
                        <TextInput
                            style={[styles.input, tempAudioId ? styles.disabledInput : {}]}
                            value={tempTtsMessage}
                            onChangeText={setTempTtsMessage}
                            placeholder={tempAudioId ? "Audio file selected" : "Enter text to speak..."}
                            editable={!tempAudioId}
                            multiline
                            numberOfLines={3}
                            textAlignVertical="top"
                        />
                    </View>
                  </>
              )}

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
    flex: 1,
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
    width: '100%',
    alignSelf: 'stretch',
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
    alignSelf: 'stretch',
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
    width: '100%',
    alignSelf: 'stretch',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  dayOption: {
    flexBasis: '31%',
    maxWidth: '31%',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    marginBottom: 8,
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
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  selectedTypeButton: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
  },
  selectedTypeButtonText: {
    color: '#fff',
  },
  helperText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
    minHeight: 100,
  },
  disabledInput: {
    backgroundColor: '#F3F4F6',
    color: '#9CA3AF',
  },
});
