const fs = require('fs');
let content = fs.readFileSync('app/settings/whatsapp/page.tsx', 'utf8');

// Remove unused variables
content = content.replace(/const \[reminderTiming, setReminderTiming\] = useState<.*>.*?\n/g, '');
content = content.replace(/const \[copiedCmd, setCopiedCmd\] = useState<.*>.*?\n/g, '');

// Remove unused handlers
content = content.replace(/const handleChangeDailySummaryTime = async[\s\S]*?};\n\n/g, '');
content = content.replace(/const handleChangeReminderTiming = async[\s\S]*?};\n\n/g, '');
content = content.replace(/const handleCopyCommand = async[\s\S]*?};\n\n/g, '');

// Remove reminderOptions
content = content.replace(/const reminderOptions:[\s\S]*?];\n\n/g, '');

// Remove unused icons from import
content = content.replace(/IconWhatsApp,\n\s*IconCheck,\n\s*IconClock,\n\s*IconChevronRight,\n\s*IconCopy,\n\s*IconZap,\n\s*IconSparkles/g, 'IconClock,\n    IconZap');

fs.writeFileSync('app/settings/whatsapp/page.tsx', content);
