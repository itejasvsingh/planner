const { StyleSheet } = require('react-native-web');
console.log(StyleSheet.create({ test: { paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' } }));
