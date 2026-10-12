import 'expo-router/entry';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import { widgetTaskHandler } from './src/widget/task-handler';

// Lets the home-screen widget draw itself while the app isn't open
registerWidgetTaskHandler(widgetTaskHandler);
