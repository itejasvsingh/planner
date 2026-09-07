const fs = require('fs');
let content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');

// Add state
content = content.replace(
    /const \[dailySummaryTime, setDailySummaryTime\] = useState\('22:00'\);/g,
    "const [dailySummaryTime, setDailySummaryTime] = useState('22:00');\n    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);"
);

// Import IosTimePicker
content = content.replace(
    /import MobileScreen from '\.\.\/\.\.\/\.\.\/components\/MobileScreen';/g,
    "import MobileScreen from '../../../components/MobileScreen';\nimport IosTimePicker from '../../../components/IosTimePicker';"
);

// Replace the row with the new one
const oldRow = `                            {/* Scheduled Delivery Time Row with Native Wheel Trigger */}
                            <div 
                                className="settings-row" 
                                style={{ position: 'relative', cursor: 'pointer' }}
                                onClick={() => {
                                    try {
                                        (document.getElementById('native-time-picker') as HTMLInputElement)?.showPicker();
                                    } catch (_) {}
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div className="settings-icon-box" style={{ backgroundColor: '#007AFF' }}>
                                        <IconClock style={{ width: 17, height: 17 }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                            Delivery Time
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                            Scheduled evening recap
                                        </div>
                                    </div>
                                </div>

                                {/* Compact Native Wheel Trigger Pill */}
                                <div className="settings-time-pill" title="Tap to adjust summary delivery time">
                                    <span>{format12Hour(dailySummaryTime)}</span>
                                </div>

                                {/* Invisible Input Covering Entire Row */}
                                <input
                                    id="native-time-picker"
                                    type="time"
                                    value={dailySummaryTime}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleChangeDailySummaryTime(e.target.value);
                                        }
                                    }}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        opacity: 0.01,
                                        cursor: 'pointer',
                                        WebkitAppearance: 'none',
                                        zIndex: 10
                                    }}
                                    aria-label="Delivery Time Picker"
                                />
                            </div>`;

const newRow = `                            {/* Scheduled Delivery Time Row with Native Wheel Trigger */}
                            <div 
                                className="settings-row clickable" 
                                style={{ cursor: 'pointer' }}
                                onClick={() => setIsTimePickerOpen(!isTimePickerOpen)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                    <div className="settings-icon-box" style={{ backgroundColor: '#007AFF' }}>
                                        <IconClock style={{ width: 17, height: 17 }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                            Delivery Time
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                            Scheduled evening recap
                                        </div>
                                    </div>
                                </div>

                                {/* Compact Native Wheel Trigger Pill */}
                                <div className="settings-time-pill" style={{ background: isTimePickerOpen ? 'rgba(118, 118, 128, 0.22)' : undefined }}>
                                    <span>{format12Hour(dailySummaryTime)}</span>
                                </div>
                            </div>

                            {/* INLINE IOS SCROLL WHEEL */}
                            <div 
                                style={{ 
                                    overflow: 'hidden', 
                                    transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                    maxHeight: isTimePickerOpen ? '140px' : '0'
                                }}
                            >
                                <div style={{ paddingBottom: '16px' }}>
                                    <IosTimePicker 
                                        value={dailySummaryTime} 
                                        onChange={(val) => {
                                            setDailySummaryTime(val); // optimistic UI update
                                            handleChangeDailySummaryTime(val);
                                        }} 
                                    />
                                </div>
                            </div>`;

content = content.replace(oldRow, newRow);
fs.writeFileSync('app/settings/whatsapp/page.tsx', content);
