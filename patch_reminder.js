const fs = require('fs');
let content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');

// Add state for reminder picker
content = content.replace(
    /const \[isTimePickerOpen, setIsTimePickerOpen\] = useState\(false\);/g,
    "const [isTimePickerOpen, setIsTimePickerOpen] = useState(false);\n    const [isReminderPickerOpen, setIsReminderPickerOpen] = useState(false);"
);

// We need to put reminderOptions back because we deleted it!
const reminderOptionsCode = `
    const reminderOptions: { id: 'exact' | '1h_before' | 'both'; title: string; desc: string }[] = [
        { id: 'exact', title: 'At Scheduled Time', desc: 'Notification fires right when your task begins' },
        { id: '1h_before', title: '1 Hour Before', desc: 'Advance heads-up notification 60 minutes prior' },
        { id: 'both', title: 'Both', desc: 'Early 60-min warning plus the on-time alert' }
    ];
`;
content = content.replace(
    /const formattedPhone = userPhone/g,
    reminderOptionsCode + "\n    const formattedPhone = userPhone"
);

// Replace the Group 2 section
const oldGroup2 = `                {/* ── Group 2: TASK REMINDER ALERTS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Task Reminder Alerts</div>
                    <div className="settings-card">
                        {reminderOptions.map((opt, idx) => {
                            const isSelected = reminderTiming === opt.id;
                            return (
                                <React.Fragment key={opt.id}>
                                    {idx > 0 && <div className="settings-divider-full" />}
                                    <div
                                        className="settings-row clickable"
                                        onClick={() => handleChangeReminderTiming(opt.id)}
                                        style={{ cursor: 'pointer' }}
                                    >
                                        <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                            <div
                                                style={{
                                                    fontSize: '17px',
                                                    fontWeight: 400,
                                                    letterSpacing: '-0.3px',
                                                    color: 'var(--text)'
                                                }}
                                            >
                                                {opt.title}
                                            </div>
                                            <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px', lineHeight: 1.25 }}>
                                                {opt.desc}
                                            </div>
                                        </div>

                                        <div style={{ width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {isSelected && (
                                                <IconCheck style={{ width: 19, height: 19, color: 'var(--blue)' }} />
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                    <div className="settings-group-footer">
                        Reminders arrive as interactive WhatsApp messages with quick status buttons to mark tasks done or snooze.
                    </div>
                </div>`;

const newGroup2 = `                {/* ── Group 2: TASK REMINDER ALERTS ── */}
                <div className="settings-group" style={{ marginBottom: 0 }}>
                    <div className="settings-group-header">Task Alerts</div>
                    <div className="settings-card">
                        <div 
                            className="settings-row clickable" 
                            style={{ cursor: 'pointer' }}
                            onClick={() => setIsReminderPickerOpen(!isReminderPickerOpen)}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                                <div className="settings-icon-box" style={{ backgroundColor: '#FF3B30' }}>
                                    <IconClock style={{ width: 17, height: 17 }} />
                                </div>
                                <div>
                                    <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px' }}>
                                        Reminder Timing
                                    </div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                        WhatsApp task alerts
                                    </div>
                                </div>
                            </div>
                            <div className="settings-time-pill" style={{ background: isReminderPickerOpen ? 'rgba(118, 118, 128, 0.22)' : undefined }}>
                                <span>{reminderTiming === 'exact' ? 'At Time' : reminderTiming === '1h_before' ? '1h Before' : 'Both'}</span>
                            </div>
                        </div>

                        <div 
                            style={{ 
                                overflow: 'hidden', 
                                transition: 'max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                                maxHeight: isReminderPickerOpen ? '300px' : '0'
                            }}
                        >
                            <div className="settings-divider-full" />
                            {reminderOptions.map((opt, idx) => {
                                const isSelected = reminderTiming === opt.id;
                                return (
                                    <React.Fragment key={opt.id}>
                                        {idx > 0 && <div className="settings-divider-full" style={{ marginLeft: '16px' }} />}
                                        <div
                                            className="settings-row clickable"
                                            onClick={() => {
                                                handleChangeReminderTiming(opt.id);
                                                setTimeout(() => setIsReminderPickerOpen(false), 200);
                                            }}
                                            style={{ cursor: 'pointer', paddingLeft: '16px', paddingRight: '16px', background: isSelected ? 'rgba(0, 122, 255, 0.05)' : 'transparent' }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                                                <div style={{ fontSize: '17px', fontWeight: 400, letterSpacing: '-0.3px', color: isSelected ? 'var(--blue)' : 'var(--text)' }}>
                                                    {opt.title}
                                                </div>
                                                <div style={{ fontSize: '13px', color: 'var(--text-light)', marginTop: '1px' }}>
                                                    {opt.desc}
                                                </div>
                                            </div>
                                            <div style={{ width: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {isSelected && <IconCheck style={{ width: 19, height: 19, color: 'var(--blue)' }} />}
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    </div>
                    <div className="settings-group-footer">
                        Reminders arrive as interactive WhatsApp messages.
                    </div>
                </div>`;

content = content.replace(oldGroup2, newGroup2);

// Make sure IconCheck is imported
if (!content.includes('IconCheck')) {
    content = content.replace('IconClock,', 'IconClock,\n    IconCheck,');
}

fs.writeFileSync('app/settings/whatsapp/page.tsx', content);
