import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  ActivityIndicator, 
  SafeAreaView, 
  KeyboardAvoidingView, 
  Platform,
  ScrollView,
  Dimensions
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Mail, Lock } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  withSpring, 
  withDelay,
  withRepeat,
  withSequence,
  Easing
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';
import { AutoBellLogoMark } from '../components/AutoBellLogo';

const { width } = Dimensions.get('window');

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animation values
  const logoScale = useSharedValue(0.5);
  const logoOpacity = useSharedValue(0);
  const formOpacity = useSharedValue(0);
  const formTranslateY = useSharedValue(50);
  
  // Error animation values
  const errorOpacity = useSharedValue(0);
  const errorHeight = useSharedValue(0);
  const errorTranslateY = useSharedValue(-10);

  useEffect(() => {
    // Start animations on mount
    logoScale.value = withSequence(
      withSpring(1, { damping: 10, stiffness: 100 }),
      withDelay(500, withRepeat(
        withSequence(
          withTiming(1.1, { duration: 1000 }),
          withTiming(1, { duration: 1000 })
        ),
        -1, // Infinite
        true // Reverse
      ))
    );
    logoOpacity.value = withTiming(1, { duration: 800 });
    
    formOpacity.value = withDelay(300, withTiming(1, { duration: 600 }));
    formTranslateY.value = withDelay(300, withTiming(0, { duration: 600, easing: Easing.out(Easing.exp) }));
  }, [logoScale, logoOpacity, formOpacity, formTranslateY]);

  useEffect(() => {
    if (error) {
      errorOpacity.value = withTiming(1, { duration: 300 });
      errorHeight.value = withSpring(60, { damping: 15 });
      errorTranslateY.value = withSpring(0, { damping: 15 });
    } else {
      errorOpacity.value = withTiming(0, { duration: 200 });
      errorHeight.value = withTiming(0, { duration: 200 });
      errorTranslateY.value = withTiming(-10, { duration: 200 });
    }
  }, [error, errorOpacity, errorHeight, errorTranslateY]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }]
  }));

  const formStyle = useAnimatedStyle(() => ({
    opacity: formOpacity.value,
    transform: [{ translateY: formTranslateY.value }]
  }));

  const errorStyle = useAnimatedStyle(() => ({
    opacity: errorOpacity.value,
    height: errorHeight.value,
    transform: [{ translateY: errorTranslateY.value }],
    marginBottom: errorOpacity.value === 0 ? 0 : 16,
    overflow: 'hidden'
  }));

  async function signInWithEmail() {
    setError(null);
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password,
    });

    if (error) setError(error.message);
    setLoading(false);
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient
        colors={['#0f172a', '#1e3a8a', '#0f172a']}
        style={styles.background}
      />
      
      {/* Abstract Background Shapes (simulated with Views) */}
      <View style={[styles.blob, styles.blobTop]} />
      <View style={[styles.blob, styles.blobBottom]} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <ScrollView 
            contentContainerStyle={styles.scrollContent} 
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.headerContainer}>
              <Animated.View style={[styles.logoCircle, logoStyle]}>
                <AutoBellLogoMark size={54} />
              </Animated.View>
              <Animated.Text style={[styles.schoolName, { opacity: logoOpacity }]}>
                AutoBell
              </Animated.Text>
              <Animated.Text style={[styles.branchName, { opacity: logoOpacity }]}>
                Intelligent AI based School Bell and Announcements Management System
              </Animated.Text>
            </View>

            <Animated.View style={[styles.formContainer, formStyle]}>
              <View style={styles.glassCard}>
                <Animated.View style={[styles.errorContainer, errorStyle]}>
                  <Text style={styles.errorText}>{error}</Text>
                </Animated.View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.label}>Email</Text>
                  <View style={styles.inputContainer}>
                    <Mail size={20} color="#93c5fd" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      onChangeText={(text) => setEmail(text)}
                      value={email}
                      placeholder="admin@school.edu"
                      autoCapitalize="none"
                      keyboardType="email-address"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                </View>

                <View style={styles.inputWrapper}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputContainer}>
                    <Lock size={20} color="#93c5fd" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      onChangeText={(text) => setPassword(text)}
                      value={password}
                      secureTextEntry
                      placeholder="••••••••"
                      autoCapitalize="none"
                      placeholderTextColor="#64748b"
                    />
                  </View>
                  <TouchableOpacity style={styles.forgotPasswordContainer}>
                    <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity 
                  style={styles.button} 
                  onPress={() => signInWithEmail()}
                  disabled={loading}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={['#2563EB', '#4F46E5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.buttonGradient}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.buttonText}>Sign In</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
              
              <View style={styles.footerContainer}>
                 <Text style={styles.footerText}>Powered by AutoBell</Text>
              </View>
            </Animated.View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  blob: {
    position: 'absolute',
    width: width * 0.8,
    height: width * 0.8,
    borderRadius: width * 0.4,
    opacity: 0.2,
  },
  blobTop: {
    backgroundColor: '#2563EB',
    top: -width * 0.2,
    left: -width * 0.2,
  },
  blobBottom: {
    backgroundColor: '#4F46E5',
    bottom: -width * 0.2,
    right: -width * 0.2,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(37, 99, 235, 0.3)', // Semi-transparent blue
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  schoolName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  branchName: {
    fontSize: 16,
    color: '#bfdbfe',
    textAlign: 'center',
  },
  formContainer: {
    width: '100%',
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  errorContainer: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)', // Red-500 with opacity
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  errorText: {
    color: '#fca5a5', // Red-300
    fontSize: 14,
    textAlign: 'center',
    fontWeight: '500',
  },
  inputWrapper: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e2e8f0',
    marginBottom: 8,
    marginLeft: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    height: 56,
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  },
  forgotPasswordContainer: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  forgotPasswordText: {
    color: '#93c5fd',
    fontSize: 14,
    fontWeight: '500',
  },
  button: {
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonGradient: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  footerContainer: {
    marginTop: 32,
    alignItems: 'center',
  },
  footerText: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontSize: 12,
  },
});
