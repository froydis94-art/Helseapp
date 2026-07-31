import AsyncStorage from "@react-native-async-storage/async-storage";

const GOAL_KEY = "helseapp.goal.v1";

export async function loadGoal() {
  try {
    const raw = await AsyncStorage.getItem(GOAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveGoal(goal) {
  await AsyncStorage.setItem(GOAL_KEY, JSON.stringify(goal));
}
