import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';
import { LogOut, Bell, ShieldAlert, Building, MapPin, Save, Upload } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';

export default function SettingsScreen() {
  const { session, schoolId } = useAuth();
  const navigation = useNavigation<any>();
  
  const [name, setName] = useState('');
  const [campusName, setCampusName] = useState('');
  const [address, setAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchSchoolSettings = React.useCallback(async () => {
    if (!schoolId) return;
    try {
      const { data, error } = await supabase
        .from('schools')
        .select('name, campus_name, address, logo_url')
        .eq('id', schoolId)
        .single();
      
      if (error) throw error;
      
      if (data) {
        setName(data.name || '');
        setCampusName(data.campus_name || '');
        setAddress(data.address || '');
        setLogoUrl(data.logo_url);
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    fetchSchoolSettings();
  }, [fetchSchoolSettings]);

  const handleSave = async () => {
    if (!schoolId) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('schools')
        .update({
          name,
          campus_name: campusName,
          address,
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', schoolId);

      if (error) throw error;
      Alert.alert('Success', 'School settings updated successfully');
    } catch (error: any) {
      console.error('Error saving settings:', error);
      Alert.alert('Error', 'Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        uploadLogo(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image');
    }
  };

  const uploadLogo = async (uri: string) => {
    if (!schoolId) return;
    setUploading(true);
    try {
      const fileExt = uri.split('.').pop() || 'jpg';
      const fileName = `${schoolId}/logo.${fileExt}`;

      const response = await fetch(uri);
      const blob = await response.blob();

      const { error: uploadError } = await supabase.storage
        .from('school-branding')
        .upload(fileName, blob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('school-branding')
        .getPublicUrl(fileName);

      // Add timestamp to force refresh
      const publicUrl = `${data.publicUrl}?t=${new Date().getTime()}`;
      setLogoUrl(publicUrl);
      
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      Alert.alert('Error', 'Failed to upload logo');
    } finally {
      setUploading(false);
    }
  };

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert('Error', error.message);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
            <Text style={styles.avatarText}>{session?.user?.email?.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.email}>{session?.user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>School Branding</Text>
        
        <View style={styles.formGroup}>
          <Text style={styles.label}>School Logo</Text>
          <View style={styles.logoContainer}>
            {logoUrl ? (
              <Image source={{ uri: logoUrl }} style={styles.logo} />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Building size={32} color="#9CA3AF" />
              </View>
            )}
            <TouchableOpacity 
              style={styles.uploadButton}
              onPress={handlePickImage}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#4B5563" />
              ) : (
                <>
                  <Upload size={16} color="#4B5563" />
                  <Text style={styles.uploadButtonText}>Change Logo</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>School Name</Text>
          <View style={styles.inputContainer}>
            <Building size={16} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Lincoln High School"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Campus Name</Text>
          <View style={styles.inputContainer}>
            <Building size={16} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={campusName}
              onChangeText={setCampusName}
              placeholder="e.g. Main Campus"
            />
          </View>
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Address</Text>
          <View style={styles.inputContainer}>
            <MapPin size={16} color="#6B7280" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 123 Main St"
            />
          </View>
        </View>

        <TouchableOpacity 
          style={[styles.saveButton, saving && styles.disabledButton]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Save size={18} color="#fff" />
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Controls</Text>
        
        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('ProfileSwitcher')}
        >
          <View style={styles.itemLeft}>
            <Bell size={20} color="#4B5563" />
            <Text style={styles.itemText}>Switch Active Profile</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('ManualTrigger')}
        >
          <View style={styles.itemLeft}>
            <Bell size={20} color="#4B5563" />
            <Text style={styles.itemText}>Manual Trigger</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.item}
          onPress={() => navigation.navigate('Emergency')}
        >
          <View style={styles.itemLeft}>
            <ShieldAlert size={20} color="#DC2626" />
            <Text style={[styles.itemText, { color: '#DC2626' }]}>Emergency Stop</Text>
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <TouchableOpacity 
          style={styles.signOutButton}
          onPress={handleSignOut}
        >
          <LogOut size={20} color="#EF4444" />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
      
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#fff',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  email: {
    fontSize: 16,
    color: '#374151',
  },
  section: {
    marginTop: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    padding: 16,
    paddingBottom: 8,
  },
  formGroup: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  inputIcon: {
    marginLeft: 12,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: '#1F2937',
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  logoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  uploadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    gap: 8,
  },
  uploadButtonText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '500',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 8,
    margin: 16,
    gap: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemText: {
    fontSize: 16,
    color: '#1F2937',
  },
  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#EF4444',
  },
});
