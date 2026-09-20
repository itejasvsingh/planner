const fs = require('fs');
const file = 'app/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// The simplest way is to manually replace the specific lines of the four modals.
// We know they start with `<div className="modal-overlay"` and end at `</form>\n                </div>\n            )}` or similar.

// 1. isEditingBudgets
code = code.replace(
    /\{isEditingBudgets && \([\s\S]*?<div className="modal-overlay"([^>]+)>([\s\S]*?)<form className="modal-sheet"([^>]+)>([\s\S]*?)<\/form>[\s\S]*?<\/div>[\s\S]*?\)}/g,
    `<AnimatePresence>
            {isEditingBudgets && (
                <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} $1>
                    $2
                    <motion.form className="modal-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} $3>
                        $4
                    </motion.form>
                </motion.div>
            )}
            </AnimatePresence>`
);

// 2. splittingItem
code = code.replace(
    /\{splittingItem && \([\s\S]*?<div className="modal-overlay"([^>]+)>([\s\S]*?)<form className="modal-sheet"([^>]+)>([\s\S]*?)<\/form>[\s\S]*?<\/div>[\s\S]*?\)}/g,
    `<AnimatePresence>
            {splittingItem && (
                <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} $1>
                    $2
                    <motion.form className="modal-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} $3>
                        $4
                    </motion.form>
                </motion.div>
            )}
            </AnimatePresence>`
);

// 3. isAdding
code = code.replace(
    /\{isAdding && \([\s\S]*?<div className="modal-overlay"([^>]+)>([\s\S]*?)<form className="modal-sheet"([^>]+)>([\s\S]*?)<\/form>[\s\S]*?<\/div>[\s\S]*?\)}/g,
    `<AnimatePresence>
            {isAdding && (
                <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} $1>
                    $2
                    <motion.form className="modal-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} $3>
                        $4
                    </motion.form>
                </motion.div>
            )}
            </AnimatePresence>`
);

// 4. editingItem
code = code.replace(
    /\{editingItem && \([\s\S]*?<div className="modal-overlay"([^>]+)>([\s\S]*?)<form className="modal-sheet"([^>]+)>([\s\S]*?)<\/form>[\s\S]*?<\/div>[\s\S]*?\)}/g,
    `<AnimatePresence>
            {editingItem && (
                <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} $1>
                    $2
                    <motion.form className="modal-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} $3>
                        $4
                    </motion.form>
                </motion.div>
            )}
            </AnimatePresence>`
);

fs.writeFileSync(file, code);
