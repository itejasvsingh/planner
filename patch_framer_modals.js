const fs = require('fs');
const file = 'app/page.tsx';
let code = fs.readFileSync(file, 'utf8');

if (!code.includes('import { motion, AnimatePresence }')) {
    code = code.replace(
        "import React, { useState, useEffect, useMemo, useRef } from 'react';",
        "import React, { useState, useEffect, useMemo, useRef } from 'react';\nimport { motion, AnimatePresence } from 'framer-motion';"
    );
}

const replaceModal = (stateVar, closeFuncStr) => {
    // We look for `{stateVar && (\n <div className="modal-overlay"`
    // Because the code might be formatted differently, we use a regex
    const regex = new RegExp(`\\{${stateVar}\\s*&&\\s*\\([\\s\\S]*?<div className="modal-overlay"([\\s\\S]*?)>([\\s\\S]*?)<div className="modal-sheet"([\\s\\S]*?)>([\\s\\S]*?)<\\/div>[\\s\\S]*?<\\/div>\\s*\\)}`, 'g');
    
    code = code.replace(regex, (match, overlayAttrs, between, sheetAttrs, inside) => {
        return `<AnimatePresence>
            {${stateVar} && (
                <motion.div 
                    className="modal-overlay" 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    ${overlayAttrs}>
                    ${between}<motion.div 
                        className="modal-sheet" 
                        initial={{ y: '100%' }}
                        animate={{ y: 0 }}
                        exit={{ y: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        ${sheetAttrs}>
                        ${inside}
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>`;
    });
};

replaceModal('isEditingBudgets');
replaceModal('splittingItem');
replaceModal('isAdding');
replaceModal('editingItem');

fs.writeFileSync(file, code);
