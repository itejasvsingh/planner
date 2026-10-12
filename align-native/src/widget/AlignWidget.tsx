import { FlexWidget, TextWidget } from 'react-native-android-widget';
import type { WidgetSnapshot } from '@/lib/widget-snapshot';

export const WIDGET_KEY = 'align_widget_snapshot';
const inr = (n: number) => `${n < 0 ? '-' : ''}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;

// Fixed brand colors: a widget can't read the app's theme
const INK = '#0D0E0F';
const MUTED = '#5E5F66';
const ACCENT = '#7F3DFF';

/** Today's tasks on top, money underneath. Tapping anywhere opens the app. */
export function AlignWidget({ snapshot }: { snapshot: WidgetSnapshot | null }) {
  const s = snapshot;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: '#F2EAFF', borderRadius: 20, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <FlexWidget style={{ flexDirection: 'column' }}>
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
          <TextWidget text="Today" style={{ fontSize: 16, fontWeight: '700', color: INK }} />
          <TextWidget
            text={!s ? 'Open Align' : s.overdue > 0 ? `${s.todayCount} due · ${s.overdue} overdue` : `${s.todayCount} due`}
            style={{ fontSize: 12, color: s && s.overdue > 0 ? '#D92D3A' : MUTED }}
          />
        </FlexWidget>
        {s && s.next.length > 0 ? (
          s.next.map((t, i) => (
            <TextWidget key={i} text={`${t.time ? `${t.time}  ` : '•  '}${t.title}`} maxLines={1} truncate="END" style={{ fontSize: 13, color: INK, marginTop: 4 }} />
          ))
        ) : (
          <TextWidget text={s ? 'Nothing due today' : 'Open the app once to load your day'} style={{ fontSize: 13, color: MUTED, marginTop: 4 }} />
        )}
      </FlexWidget>
      {s && s.left !== null && (
        <FlexWidget style={{ flexDirection: 'row', justifyContent: 'space-between', width: 'match_parent' }}>
          <TextWidget text={`Left ${inr(s.left)}`} style={{ fontSize: 14, fontWeight: '700', color: ACCENT }} />
          <TextWidget text={`Spent today ${inr(s.spentToday)}`} style={{ fontSize: 12, color: MUTED }} />
        </FlexWidget>
      )}
    </FlexWidget>
  );
}
