const fs = require('fs');
let content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');

// Add state if not present
if (!content.includes('const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);')) {
    content = content.replace(
        /const \[dailySummaryTime, setDailySummaryTime\] = useState\('22:00'\);/g,
        "const [dailySummaryTime, setDailySummaryTime] = useState('22:00');\n    const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);"
    );
}

// Add import if not present
if (!content.includes('import IosTimePicker')) {
    content = content.replace(
        /import MobileScreen from '\.\.\/\.\.\/\.\.\/components\/MobileScreen';/g,
        "import MobileScreen from '../../../components/MobileScreen';\nimport IosTimePicker from '../../../components/IosTimePicker';"
    );
}

const startIdx = content.indexOf('{/* Scheduled Delivery Time Row with Native Wheel Trigger */}');
const endIdx = content.indexOf('<div className="settings-divider" />', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
    const before = content.substring(0, startIdx);
    const after = content.substring(endIdx);
    
    const newSection = `{/* Scheduled Delivery Time Row with Native Wheel Trigger */}
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
                            </div>

                            `;
                            
    fs.writeFileSync('app/settings/whatsapp/page.tsx', before + newSection + after);
} else {
    console.log("Could not find boundaries");
}
