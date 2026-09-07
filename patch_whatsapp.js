const fs = require('fs');
const content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');
const lines = content.split('\n');
const returnIdx = lines.findIndex(l => l.startsWith('    return ('));
if (returnIdx > -1) {
    const kept = lines.slice(0, returnIdx);
    kept.push(`    return (
        <MobileScreen
            title="WhatsApp"
        >
            <div className="-mx-4" style={{ display: 'flex', flexDirection: 'column', marginTop: '-16px' }}>
                {/* Status Header Edge-to-Edge */}
                <div className="py-6 px-6 border-b border-gray-100 dark:border-neutral-900 flex justify-between items-center bg-white dark:bg-black">
                    <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Status</p>
                        <p className="text-[20px] tracking-tight text-black dark:text-white font-medium">{formattedPhone}</p>
                    </div>
                    <span className={\`text-[12px] font-bold px-3 py-1.5 rounded-full \${dailySummaryEnabled ? 'text-[#25D366] bg-[#25D366]/10' : 'text-gray-500 bg-gray-100 dark:bg-neutral-800'}\`}>
                        {dailySummaryEnabled ? 'Connected' : 'Standby'}
                    </span>
                </div>

                {/* Minimalist Settings Rows */}
                <div className="py-2 bg-white dark:bg-black">
                    {/* Sleek Row */}
                    <div className="flex items-center justify-between px-6 py-4 active:bg-neutral-50 dark:active:bg-neutral-900 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-gray-50 dark:bg-neutral-900 flex items-center justify-center">
                                <IconClock className="w-5 h-5 text-neutral-500 dark:text-neutral-400" />
                            </div>
                            <div>
                                <p className="text-[16px] font-medium text-black dark:text-white tracking-tight">Daily Summary</p>
                                <p className="text-[13px] text-neutral-500 mt-0.5">Delivers tasks at {format12Hour(dailySummaryTime)}</p>
                            </div>
                        </div>
                        
                        {/* Minimal Native Toggle */}
                        <button
                            onClick={handleToggleDailySummary}
                            className={\`relative inline-flex h-[30px] w-[50px] items-center rounded-full transition-colors duration-200 [-webkit-tap-highlight-color:transparent] \${dailySummaryEnabled ? 'bg-[#25D366]' : 'bg-gray-200 dark:bg-neutral-800'}\`}
                        >
                            <span className={\`inline-block h-[26px] w-[26px] transform rounded-full bg-white transition-transform duration-200 shadow-sm \${dailySummaryEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'}\`} />
                        </button>
                    </div>

                    {/* Action Row */}
                    <div 
                        onClick={handleSendTestSummary}
                        className="flex items-center justify-between px-6 py-4 cursor-pointer active:bg-neutral-50 dark:active:bg-neutral-900 transition-colors mt-2"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                                <IconZap className="w-5 h-5 text-[#007AFF] dark:text-[#0A84FF]" />
                            </div>
                            <p className="text-[16px] font-medium text-[#007AFF] dark:text-[#0A84FF] tracking-tight">
                                {isSendingTest ? 'Sending...' : testStatus ? testStatus : 'Send Test Summary Now'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </MobileScreen>
    );
}`);
    fs.writeFileSync('app/settings/whatsapp/page.tsx', kept.join('\n'));
}
