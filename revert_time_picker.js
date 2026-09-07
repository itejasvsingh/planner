const fs = require('fs');
let content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');

// Remove state
content = content.replace(
    /const \[dailySummaryTime, setDailySummaryTime\] = useState\('22:00'\);\n    const \[isTimePickerOpen, setIsTimePickerOpen\] = useState\(false\);/g,
    "const [dailySummaryTime, setDailySummaryTime] = useState('22:00');"
);

// Remove IosTimePicker import
content = content.replace(
    /import IosTimePicker from '\.\.\/\.\.\/\.\.\/components\/IosTimePicker';\n/g,
    ""
);

// Replace the row with the original native input
const badSectionRegex = /\{\/\* Scheduled Delivery Time Row with Native Wheel Trigger \*\/\}[\s\S]*?\{\/\* INLINE IOS SCROLL WHEEL \*\/\}[\s\S]*?<\/div>\n                            <\/div>/;

const nativeSection = `<div className="settings-row">
                                <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px', color: 'var(--text)' }}>
                                    Delivery Time
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <input
                                        type="time"
                                        value={dailySummaryTime}
                                        onChange={e => {
                                            setDailySummaryTime(e.target.value);
                                            handleChangeDailySummaryTime(e.target.value);
                                        }}
                                        style={{
                                            background: 'rgba(120, 120, 128, 0.08)',
                                            border: 'none',
                                            borderRadius: '6px',
                                            padding: '6px 12px',
                                            fontSize: '16px',
                                            fontWeight: 600,
                                            color: 'var(--blue)',
                                            outline: 'none',
                                            fontFamily: 'inherit',
                                            cursor: 'pointer'
                                        }}
                                    />
                                </div>
                            </div>`;

content = content.replace(badSectionRegex, nativeSection);
fs.writeFileSync('app/settings/whatsapp/page.tsx', content);
