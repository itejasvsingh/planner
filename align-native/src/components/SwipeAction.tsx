import React, { useRef } from 'react';
import { Animated, View, StyleSheet, Text } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface SwipeActionProps {
  children: React.ReactNode;
  onComplete?: () => void;
  onDelete?: () => void;
}

export default function SwipeAction({ children, onComplete, onDelete }: SwipeActionProps) {
  const swipeableRef = useRef<Swipeable>(null);

  const renderLeftActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onComplete) return null;
    const trans = dragX.interpolate({
      inputRange: [0, 50, 100, 101],
      outputRange: [-20, 0, 0, 1],
    });
    const opacity = dragX.interpolate({
      inputRange: [0, 30, 100],
      outputRange: [0, 1, 1],
    });
    return (
      <View style={[styles.actionBox, { backgroundColor: '#34C759', justifyContent: 'flex-start', paddingLeft: 24 }]}>
        <Animated.Text style={[styles.actionText, { transform: [{ translateX: trans }], opacity }]}>
          Complete
        </Animated.Text>
      </View>
    );
  };

  const renderRightActions = (progress: Animated.AnimatedInterpolation<number>, dragX: Animated.AnimatedInterpolation<number>) => {
    if (!onDelete) return null;
    const trans = dragX.interpolate({
      inputRange: [-100, -50, 0],
      outputRange: [0, 0, 20],
    });
    const opacity = dragX.interpolate({
      inputRange: [-100, -30, 0],
      outputRange: [1, 1, 0],
    });
    return (
      <View style={[styles.actionBox, { backgroundColor: '#FF3B30', justifyContent: 'flex-end', paddingRight: 24 }]}>
        <Animated.Text style={[styles.actionText, { transform: [{ translateX: trans }], opacity }]}>
          Delete
        </Animated.Text>
      </View>
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === 'left' && onComplete) {
          onComplete();
          swipeableRef.current?.close();
        } else if (direction === 'right' && onDelete) {
          onDelete();
          swipeableRef.current?.close();
        }
      }}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      containerStyle={styles.container}
    >
      <View style={styles.childContainer}>
        {children}
      </View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
  },
  childContainer: {
    backgroundColor: 'transparent',
  },
  actionBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  }
});

