import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ScrollView, ActivityIndicator } from 'react-native';
import SecureStorage from '../utils/SecureStorage';
import { Audio } from 'expo-av';
import { supabase } from '../lib/supabase';
import { generateTTS, generateTopMediaiTTS, generateCambAITTS, generateElevenLabsTTS } from '../lib/tts';
import { useAuth } from '../context/AuthContext';
import { Mic, Square, Play, Send, Type, Radio, Trash2 } from 'lucide-react-native';

type TtsProvider = 'google-free' | 'openai' | 'cambai' | 'elevenlabs' | 'topmediai';
type GoogleFreeVoiceGender = 'female' | 'male';

export default function BroadcastScreen() {
  const { schoolId, ttsEnabled, session } = useAuth();
  const [activeTab, setActiveTab] = useState<'text' | 'voice'>('text');

  // TTS State
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>('google-free');
  const [text, setText] = useState('');
  const [googleFreeVoiceGender, setGoogleFreeVoiceGender] = useState<GoogleFreeVoiceGender>('female');
  const [apiKey, setApiKey] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1');
  const [model, setModel] = useState('tts-1');
  const ttsLanguage = 'en';

  // TopMediai State
  const [topMediaiKey, setTopMediaiKey] = useState('');
  const [topMediaiSpeaker, setTopMediaiSpeaker] = useState('00151554-3826-11ee-a861-00163e2ac61b');
  const [topMediaiEmotion, setTopMediaiEmotion] = useState('Neutral');

  // Camb.ai State
  const [cambAiKey, setCambAiKey] = useState('');

  // ElevenLabs State
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState('21m00Tcm4TlvDq8ikWAM');
  
  // Voice Note State
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  
  // General State
  const [isSending, setIsSending] = useState(false);
  const [permissionResponse, requestPermission] = Audio.usePermissions();

  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const [
          key,
          savedUrl,
          savedModel,
          savedTmKey,
          savedTmSpeaker,
          savedTmEmotion,
          savedCambAiKey,
          savedElevenKey,
          savedElevenVoiceId,
          savedGoogleFreeGender,
        ] = await Promise.all([
          SecureStorage.getItem('openai_api_key'),
          SecureStorage.getItem('openai_base_url'),
          SecureStorage.getItem('openai_model'),
          SecureStorage.getItem('topmediai_api_key'),
          SecureStorage.getItem('topmediai_speaker'),
          SecureStorage.getItem('topmediai_emotion'),
          SecureStorage.getItem('cambai_api_key'),
          SecureStorage.getItem('elevenlabs_api_key'),
          SecureStorage.getItem('elevenlabs_voice_id'),
          SecureStorage.getItem('google_free_voice_gender'),
        ]);
        if (key) setApiKey(key);
        if (savedUrl) setBaseUrl(savedUrl);
        if (savedModel) setModel(savedModel);
        if (savedTmKey) setTopMediaiKey(savedTmKey);
        if (savedTmSpeaker) setTopMediaiSpeaker(savedTmSpeaker);
        if (savedTmEmotion) setTopMediaiEmotion(savedTmEmotion);
        if (savedCambAiKey) setCambAiKey(savedCambAiKey);
        if (savedElevenKey) setElevenLabsKey(savedElevenKey);
        if (savedElevenVoiceId) setElevenLabsVoiceId(savedElevenVoiceId);
        if (savedGoogleFreeGender === 'male' || savedGoogleFreeGender === 'female') {
          setGoogleFreeVoiceGender(savedGoogleFreeGender);
        }
      } catch (e) {
        console.error('Failed to load settings', e);
      }
    };
    loadSettings();
  }, []);

  useEffect(() => {
    const loadTtsProviderPreference = async () => {
      if (!session?.user) return;

      try {
        const { data, error } = await supabase
          .from('users')
          .select('tts_provider')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error loading TTS provider preference:', error);
          return;
        }

        const provider = data?.tts_provider as TtsProvider | null;

        if (
          provider === 'google-free' ||
          provider === 'openai' ||
          provider === 'cambai' ||
          provider === 'elevenlabs' ||
          provider === 'topmediai'
        ) {
          setTtsProvider(provider);
          await SecureStorage.setItem('tts_provider', provider);
        } else {
          setTtsProvider('google-free');
          await SecureStorage.setItem('tts_provider', 'google-free');
        }
      } catch (error) {
        console.error('Unexpected error loading TTS provider preference:', error);
      }
    };

    loadTtsProviderPreference();
  }, [session]);

  if (!ttsEnabled) {
    return (
      <View style={styles.disabledContainer}>
        <View style={styles.disabledContent}>
          <Radio size={48} color="#EAB308" />
          <Text style={styles.disabledTitle}>Feature Disabled</Text>
          <Text style={styles.disabledText}>
            The Text-to-Speech and Voice Note feature is currently disabled for your account. 
            Please contact the Super Admin to enable it.
          </Text>
        </View>
      </View>
    );
  }

  const startRecording = async () => {
    try {
      if (permissionResponse?.status !== 'granted') {
        const resp = await requestPermission();
        if (resp.status !== 'granted') {
          Alert.alert('Permission needed', 'Microphone permission is required.');
          return;
        }
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(recording);
    } catch (err) {
      console.error('Failed to start recording', err);
      Alert.alert('Error', 'Failed to start recording');
    }
  };

  const stopRecording = async () => {
    if (!recording) return;
    setRecording(null);
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    setRecordedUri(uri);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
    });
  };

  const playPreview = async () => {
    if (!recordedUri) return;
    
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: recordedUri });
      setSound(newSound);
      await newSound.playAsync();
    } catch (error) {
      console.error('Playback failed', error);
      Alert.alert('Error', 'Playback failed');
    }
  };

  const broadcastVoice = async () => {
    if (!recordedUri || !schoolId) return;

    setIsSending(true);

    try {
      // 1. Get Blob
      const response = await fetch(recordedUri);
      const blob = await response.blob();

      // 2. Upload to Supabase
      const fileName = `${schoolId}/${Date.now()}_voice_note.m4a`;
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, blob, {
          contentType: 'audio/mp4' // Expo high quality is usually m4a/mp4
        });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName);

      // 4. Send Command
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId);

      if (deviceError) throw deviceError;

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school');
      }

      const commands = devices.map(d => ({
        device_id: d.id,
        command: 'PLAY_URL',
        payload: { url: publicUrl },
        status: 'pending',
        school_id: schoolId
      }));

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands);

      if (cmdError) throw cmdError;

      Alert.alert('Success', 'Voice note broadcasted successfully!');
      setRecordedUri(null);
    } catch (error: any) {
      console.error('Broadcast failed:', error);
      Alert.alert('Error', error.message || 'Failed to broadcast');
    } finally {
      setIsSending(false);
    }
  };

  const broadcastText = async () => {
    if (!text || !schoolId) return;

    if (ttsProvider === 'google-free') {
      setIsSending(true);
      try {
        const { data: devices, error: deviceError } = await supabase
          .from('bell_devices')
          .select('id')
          .eq('school_id', schoolId);

        if (deviceError) throw deviceError;

        if (!devices || devices.length === 0) {
          throw new Error('No devices found for this school');
        }

        const commands = devices.map(d => ({
          device_id: d.id,
          command: 'TTS',
          payload: { text, language: ttsLanguage, voice_gender: googleFreeVoiceGender },
          status: 'pending',
          school_id: schoolId,
        }));

        const { error: cmdError } = await supabase
          .from('command_queue')
          .insert(commands);

        if (cmdError) throw cmdError;

        Alert.alert('Success', 'Announcement broadcasted successfully!');
        setText('');
      } catch (error: any) {
        console.error('Broadcast failed:', error);
        Alert.alert('Error', error.message || 'Failed to broadcast');
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (ttsProvider === 'openai' && !apiKey) {
      Alert.alert('Missing API Key', 'Please enter your OpenAI API Key.');
      return;
    }

    if (ttsProvider === 'topmediai' && !topMediaiKey) {
      Alert.alert('Missing API Key', 'Please enter your TopMediai API Key.');
      return;
    }

    if (ttsProvider === 'cambai' && !cambAiKey) {
      Alert.alert('Missing API Key', 'Please enter your Camb.ai API Key.');
      return;
    }

    if (ttsProvider === 'elevenlabs' && !elevenLabsKey) {
      Alert.alert('Missing API Key', 'Please enter your ElevenLabs API Key.');
      return;
    }

    setIsSending(true);

    try {
      let audioBlob;
      if (ttsProvider === 'topmediai') {
        audioBlob = await generateTopMediaiTTS(text, topMediaiKey, topMediaiSpeaker, topMediaiEmotion);
      } else if (ttsProvider === 'cambai') {
        audioBlob = await generateCambAITTS(text, cambAiKey);
      } else if (ttsProvider === 'elevenlabs') {
        audioBlob = await generateElevenLabsTTS(text, elevenLabsKey, elevenLabsVoiceId);
      } else {
        audioBlob = await generateTTS(text, apiKey, baseUrl, model);
      }
      
      // 2. Upload to Supabase
      const fileName = `${schoolId}/${Date.now()}_tts.mp3`;
      const { error: uploadError } = await supabase.storage
        .from('voice-notes')
        .upload(fileName, audioBlob, {
          contentType: 'audio/mpeg'
        });

      if (uploadError) throw uploadError;

      // 3. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('voice-notes')
        .getPublicUrl(fileName);

      // 4. Send Command
      const { data: devices, error: deviceError } = await supabase
        .from('bell_devices')
        .select('id')
        .eq('school_id', schoolId);

      if (deviceError) throw deviceError;

      if (!devices || devices.length === 0) {
        throw new Error('No devices found for this school');
      }

      const commands = devices.map(d => ({
        device_id: d.id,
        command: 'PLAY_URL',
        payload: { url: publicUrl },
        status: 'pending',
        school_id: schoolId
      }));

      const { error: cmdError } = await supabase
        .from('command_queue')
        .insert(commands);

      if (cmdError) throw cmdError;

      Alert.alert('Success', 'Announcement broadcasted successfully!');
      setText('');
    } catch (error: any) {
      console.error('Broadcast failed:', error);
      Alert.alert('Error', error.message || 'Failed to broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'text' && styles.activeTab]}
          onPress={() => setActiveTab('text')}
        >
          <Type color={activeTab === 'text' ? '#4F46E5' : '#6B7280'} size={20} />
          <Text style={[styles.tabText, activeTab === 'text' && styles.activeTabText]}>Text to Speech</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'voice' && styles.activeTab]}
          onPress={() => setActiveTab('voice')}
        >
          <Mic color={activeTab === 'voice' ? '#4F46E5' : '#6B7280'} size={20} />
          <Text style={[styles.tabText, activeTab === 'voice' && styles.activeTabText]}>Voice Note</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {activeTab === 'text' ? (
          <View style={styles.section}>
            <Text style={styles.label}>Message</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Type your announcement here..."
              multiline
              numberOfLines={4}
              value={text}
              onChangeText={setText}
              textAlignVertical="top"
            />

            <Text style={[styles.label, { marginTop: 8 }]}>TTS Provider</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <TouchableOpacity
                style={[
                  styles.providerButton,
                  ttsProvider === 'google-free' && styles.activeProviderButton,
                ]}
                onPress={async () => {
                  setTtsProvider('google-free');
                  await SecureStorage.setItem('tts_provider', 'google-free');
                  if (session?.user) {
                    try {
                      const { error } = await supabase
                        .from('users')
                        .update({ tts_provider: 'google-free' })
                        .eq('id', session.user.id);
                      if (error) {
                        console.error('Failed to save TTS provider preference:', error);
                      }
                    } catch (error) {
                      console.error('Unexpected error saving TTS provider preference:', error);
                    }
                  }
                }}
              >
                <Text
                  style={[
                    styles.providerButtonText,
                    ttsProvider === 'google-free' && styles.activeProviderButtonText,
                  ]}
                >
                  Device Built-in
                </Text>
                <Text style={{ fontSize: 10, color: '#6B7280' }}>Free · Default</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerButton,
                  ttsProvider === 'openai' && styles.activeProviderButton,
                ]}
                onPress={async () => {
                  setTtsProvider('openai');
                  await SecureStorage.setItem('tts_provider', 'openai');
                  if (session?.user) {
                    try {
                      const { error } = await supabase
                        .from('users')
                        .update({ tts_provider: 'openai' })
                        .eq('id', session.user.id);
                      if (error) {
                        console.error('Failed to save TTS provider preference:', error);
                      }
                    } catch (error) {
                      console.error('Unexpected error saving TTS provider preference:', error);
                    }
                  }
                }}
              >
                <Text
                  style={[
                    styles.providerButtonText,
                    ttsProvider === 'openai' && styles.activeProviderButtonText,
                  ]}
                >
                  OpenAI TTS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerButton,
                  ttsProvider === 'cambai' && styles.activeProviderButton,
                ]}
                onPress={async () => {
                  setTtsProvider('cambai');
                  await SecureStorage.setItem('tts_provider', 'cambai');
                  if (session?.user) {
                    try {
                      const { error } = await supabase
                        .from('users')
                        .update({ tts_provider: 'cambai' })
                        .eq('id', session.user.id);
                      if (error) {
                        console.error('Failed to save TTS provider preference:', error);
                      }
                    } catch (error) {
                      console.error('Unexpected error saving TTS provider preference:', error);
                    }
                  }
                }}
              >
                <Text
                  style={[
                    styles.providerButtonText,
                    ttsProvider === 'cambai' && styles.activeProviderButtonText,
                  ]}
                >
                  Camb AI TTS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.providerButton,
                  ttsProvider === 'elevenlabs' && styles.activeProviderButton,
                ]}
                onPress={async () => {
                  setTtsProvider('elevenlabs');
                  await SecureStorage.setItem('tts_provider', 'elevenlabs');
                  if (session?.user) {
                    try {
                      const { error } = await supabase
                        .from('users')
                        .update({ tts_provider: 'elevenlabs' })
                        .eq('id', session.user.id);
                      if (error) {
                        console.error('Failed to save TTS provider preference:', error);
                      }
                    } catch (error) {
                      console.error('Unexpected error saving TTS provider preference:', error);
                    }
                  }
                }}
              >
                <Text
                  style={[
                    styles.providerButtonText,
                    ttsProvider === 'elevenlabs' && styles.activeProviderButtonText,
                  ]}
                >
                  ElevenLabs TTS
                </Text>
              </TouchableOpacity>
            </View>

            {ttsProvider === 'google-free' && (
              <View style={{ marginBottom: 12 }}>
                <Text style={styles.label}>Voice</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                  <TouchableOpacity
                    style={[
                      styles.providerButton,
                      googleFreeVoiceGender === 'female' && styles.activeProviderButton,
                    ]}
                    onPress={async () => {
                      setGoogleFreeVoiceGender('female');
                      await SecureStorage.setItem('google_free_voice_gender', 'female');
                    }}
                  >
                    <Text
                      style={[
                        styles.providerButtonText,
                        googleFreeVoiceGender === 'female' && styles.activeProviderButtonText,
                      ]}
                    >
                      Female
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.providerButton,
                      googleFreeVoiceGender === 'male' && styles.activeProviderButton,
                    ]}
                    onPress={async () => {
                      setGoogleFreeVoiceGender('male');
                      await SecureStorage.setItem('google_free_voice_gender', 'male');
                    }}
                  >
                    <Text
                      style={[
                        styles.providerButtonText,
                        googleFreeVoiceGender === 'male' && styles.activeProviderButtonText,
                      ]}
                    >
                      Male
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {ttsProvider === 'openai' && !apiKey && (
              <View style={{ marginTop: 16 }}>
                <Text style={[styles.label, { color: '#DC2626' }]}>OpenAI API Key (Required)</Text>
                <TextInput
                  style={[styles.input, { borderColor: '#FECACA' }]}
                  placeholder="sk-..."
                  secureTextEntry
                  onChangeText={(t) => {
                    setApiKey(t);
                    SecureStorage.setItem('openai_api_key', t);
                  }}
                />
              </View>
            )}

            <TouchableOpacity 
              onPress={() => setShowAdvanced(!showAdvanced)} 
              style={{ marginTop: 16, marginBottom: 8 }}
            >
              <Text style={{ color: '#4F46E5', fontWeight: '500' }}>
                {showAdvanced ? 'Hide Advanced Settings' : 'Show Advanced Settings'}
              </Text>
            </TouchableOpacity>

            {showAdvanced && (
              <View style={{ gap: 12, marginBottom: 16 }}>
                <View>
                  <Text style={styles.label}>API Base URL</Text>
                  <TextInput
                    style={styles.input}
                    value={baseUrl}
                    placeholder="https://api.openai.com/v1"
                    onChangeText={(t) => {
                      setBaseUrl(t);
                      SecureStorage.setItem('openai_base_url', t);
                    }}
                  />
                  <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>
                    Default: https://api.openai.com/v1
                  </Text>
                </View>
                <View>
                  <Text style={styles.label}>Model</Text>
                  <TextInput
                    style={styles.input}
                    value={model}
                    placeholder="tts-1"
                    onChangeText={(t) => {
                      setModel(t);
                      SecureStorage.setItem('openai_model', t);
                    }}
                  />
                </View>
              </View>
            )}

            {ttsProvider === 'cambai' && (
              <View style={{ gap: 12, marginBottom: 16 }}>
                <View>
                  <Text style={styles.label}>Camb.ai API Key</Text>
                  <TextInput
                    style={styles.input}
                    value={cambAiKey}
                    placeholder="x-api-key"
                    secureTextEntry
                    onChangeText={async (t) => {
                      setCambAiKey(t);
                      await SecureStorage.setItem('cambai_api_key', t);
                    }}
                  />
                </View>
              </View>
            )}

            {ttsProvider === 'elevenlabs' && (
              <View style={{ gap: 12, marginBottom: 16 }}>
                <View>
                  <Text style={styles.label}>ElevenLabs API Key</Text>
                  <TextInput
                    style={styles.input}
                    value={elevenLabsKey}
                    placeholder="xi-..."
                    secureTextEntry
                    onChangeText={async (t) => {
                      setElevenLabsKey(t);
                      await SecureStorage.setItem('elevenlabs_api_key', t);
                    }}
                  />
                </View>
                <View>
                  <Text style={styles.label}>Voice ID</Text>
                  <TextInput
                    style={styles.input}
                    value={elevenLabsVoiceId}
                    placeholder="21m00Tcm4TlvDq8ikWAM"
                    onChangeText={async (t) => {
                      setElevenLabsVoiceId(t);
                      await SecureStorage.setItem('elevenlabs_voice_id', t);
                    }}
                  />
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, (!text || isSending) && styles.disabledButton]}
              onPress={broadcastText}
              disabled={!text || isSending}
            >
              <Send color="white" size={20} />
              <Text style={styles.buttonText}>{isSending ? 'Sending...' : 'Broadcast'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.voiceSection}>
            <TouchableOpacity
              style={[styles.recordButton, recording && styles.recordingActive]}
              onPress={recording ? stopRecording : startRecording}
            >
              {recording ? (
                <Square color="white" size={40} />
              ) : (
                <Mic color="#EF4444" size={40} />
              )}
            </TouchableOpacity>
            
            <Text style={styles.hint}>
              {recording ? 'Recording... Tap to stop' : 'Tap microphone to start'}
            </Text>

            {recordedUri && !recording && (
              <View style={styles.previewContainer}>
                <View style={styles.previewControls}>
                  <TouchableOpacity onPress={playPreview} style={styles.previewButton}>
                    <Play color="#374151" size={20} />
                    <Text style={styles.previewText}>Play Preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    onPress={() => setRecordedUri(null)}
                    style={styles.deleteButton}
                  >
                    <Trash2 color="#DC2626" size={20} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.button, isSending && styles.disabledButton]}
                  onPress={broadcastVoice}
                  disabled={isSending}
                >
                  {isSending ? <ActivityIndicator color="white" /> : <Radio color="white" size={20} />}
                  <Text style={styles.buttonText}>{isSending ? 'Sending...' : 'Broadcast'}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#F3F4F6',
    padding: 16,
  },
  providerButton: {
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: 'white',
    flex: 1,
    alignItems: 'center',
  },
  activeProviderButton: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  providerButtonText: {
    color: '#374151',
    fontWeight: '500',
  },
  activeProviderButtonText: {
    color: '#4F46E5',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderRadius: 8,
    marginBottom: 20,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: '#EEF2FF',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#4F46E5',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  section: {
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    height: 120,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  voiceSection: {
    alignItems: 'center',
    gap: 20,
    paddingVertical: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingActive: {
    backgroundColor: '#DC2626',
  },
  hint: {
    color: '#6B7280',
    fontSize: 14,
  },
  previewContainer: {
    width: '100%',
    gap: 16,
    marginTop: 10,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  previewControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
  },
  previewText: {
    color: '#374151',
    fontWeight: '500',
  },
  deleteButton: {
    padding: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
  },
  disabledContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 20,
  },
  disabledContent: {
    alignItems: 'center',
    backgroundColor: '#FEFCE8',
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FEF08A',
    width: '100%',
  },
  disabledTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#854D0E',
    marginTop: 16,
    marginBottom: 8,
  },
  disabledText: {
    textAlign: 'center',
    color: '#A16207',
    fontSize: 16,
    lineHeight: 24,
  },
});
