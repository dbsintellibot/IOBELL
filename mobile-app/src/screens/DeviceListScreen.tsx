import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, Modal, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { Wifi, WifiOff, Plus, X, Settings, RefreshCw } from 'lucide-react-native';

type DeviceRecord = {
  id: string;
  name: string;
  status: string | null;
  mac_address: string | null;
  last_heartbeat: string | null;
};

export default function DeviceListScreen() {
  const { schoolId } = useAuth();
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Registration Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    fetchDevices();
    const interval = setInterval(fetchDevices, 5000); // Poll for heartbeats
    return () => clearInterval(interval);
  }, [schoolId]);

  const fetchDevices = async () => {
    if (!schoolId) return;
    try {
      const { data, error } = await supabase
        .from('bell_devices')
        .select('*')
        .order('name');
      
      if (error) throw error;
      setDevices((data ?? []) as DeviceRecord[]);
    } catch (error) {
      console.error('Error fetching devices:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRegister = async () => {
    if (!newDeviceName.trim() || !serialNumber.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setRegistering(true);
    try {
      const { error } = await supabase.rpc('claim_device', {
        p_serial_number: serialNumber,
        p_device_name: newDeviceName
      });

      if (error) throw error;

      Alert.alert('Success', 'Device registered successfully!');
      setModalVisible(false);
      setNewDeviceName('');
      setSerialNumber('');
      fetchDevices();
    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert('Error', error.message || 'Failed to register device');
    } finally {
      setRegistering(false);
    }
  };

  const sendCommand = async (deviceId: string, command: string) => {
    if (!schoolId) return;
    try {
      const { error } = await supabase.from('command_queue').insert({
        device_id: deviceId,
        school_id: schoolId,
        command,
        payload: {}
      });

      if (error) throw error;
      Alert.alert('Success', `Command ${command} sent successfully`);
    } catch (error) {
      console.error('Command error:', error);
      Alert.alert('Error', 'Failed to send command');
    }
  };

  const renderItem = ({ item }: { item: DeviceRecord }) => (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>{item.name}</Text>
          <Text style={styles.macAddress}>{item.mac_address || 'No MAC'}</Text>
          <Text style={styles.lastSeen}>
            Last seen: {item.last_heartbeat ? new Date(item.last_heartbeat).toLocaleTimeString() : 'Never'}
          </Text>
        </View>
        <View style={[styles.statusBadge, item.status === 'online' ? styles.statusOnline : styles.statusOffline]}>
          {item.status === 'online' ? (
            <Wifi size={14} color="#065F46" />
          ) : (
            <WifiOff size={14} color="#991B1B" />
          )}
          <Text style={[styles.statusText, item.status === 'online' ? styles.textOnline : styles.textOffline]}>
            {item.status?.toUpperCase() || 'UNKNOWN'}
          </Text>
        </View>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => sendCommand(item.id, 'CONFIG')}
        >
          <Settings size={16} color="#2563EB" />
          <Text style={styles.actionButtonText}>Config</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={() => sendCommand(item.id, 'REBOOT')}
        >
          <RefreshCw size={16} color="#EF4444" />
          <Text style={[styles.actionButtonText, { color: '#EF4444' }]}>Reboot</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Devices</Text>
        <TouchableOpacity 
          style={styles.addButton}
          onPress={() => setModalVisible(true)}
        >
          <Plus size={20} color="#fff" />
          <Text style={styles.addButtonText}>Register</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={devices}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          onRefresh={() => {
            setRefreshing(true);
            fetchDevices();
          }}
          refreshing={refreshing}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No devices found</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Register New Device</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Device Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Main Hall Bell"
                value={newDeviceName}
                onChangeText={setNewDeviceName}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Serial Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter device serial number"
                value={serialNumber}
                onChangeText={setSerialNumber}
              />
            </View>

            <TouchableOpacity 
              style={[styles.submitButton, registering && styles.disabledButton]}
              onPress={handleRegister}
              disabled={registering}
            >
              {registering ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Register Device</Text>
              )}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  macAddress: {
    fontSize: 14,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  lastSeen: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  statusOnline: {
    backgroundColor: '#D1FAE5',
  },
  statusOffline: {
    backgroundColor: '#FEE2E2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  textOnline: {
    color: '#065F46',
  },
  textOffline: {
    color: '#991B1B',
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563EB',
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
  // Modal Styles
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
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  submitButton: {
    backgroundColor: '#2563EB',
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
