import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widget-snapshot';
import { AlignWidget, WIDGET_KEY } from './AlignWidget';

/** Draws the widget from the snapshot the app last saved (the app refreshes it whenever your data changes). */
export async function widgetTaskHandler(props: WidgetTaskHandlerProps) {
  if (props.widgetAction === 'WIDGET_DELETED') return;
  let snapshot: WidgetSnapshot | null = null;
  try {
    const raw = await AsyncStorage.getItem(WIDGET_KEY);
    snapshot = raw ? (JSON.parse(raw) as WidgetSnapshot) : null;
  } catch {
    // an unreadable snapshot shows the "open the app" state
  }
  props.renderWidget(<AlignWidget snapshot={snapshot} />);
}
