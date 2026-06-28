import React, { useRef, useState, useEffect } from 'react';
import { WebView } from 'react-native-webview';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, BackHandler, View, Platform, StatusBar as RNStatusBar } from 'react-native';

export default function App() {
  const webViewRef = useRef<WebView>(null);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    const handleBackPress = () => {
      if (canGoBack && webViewRef.current) {
        webViewRef.current.goBack();
        return true;
      }
      return false;
    };

    BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => BackHandler.removeEventListener('hardwareBackPress', handleBackPress);
  }, [canGoBack]);

  return (
    <View style={styles.container}>
      <StatusBar style="dark" backgroundColor="#F3F4F6" />
      <WebView
        ref={webViewRef}
        source={{ uri: 'https://iobell.web.app' }}
        style={styles.webview}
        onNavigationStateChange={(navState) => setCanGoBack(navState.canGoBack)}
        allowsInlineMediaPlayback={true}
        mediaPlaybackRequiresUserAction={false}
        bounces={false}
        originWhitelist={['*']}
        domStorageEnabled={true}
        javaScriptEnabled={true}
        startInLoadingState={true}
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(request) => {
          // Block external intents and weird schemes that crash Android WebView
          if (request.url.startsWith('http://') || request.url.startsWith('https://')) {
            return true;
          }
          return false;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight : 0,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
