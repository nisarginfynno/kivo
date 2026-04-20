import { useEffect, useState } from "react";
import { browser } from "wxt/browser";
import {
  DEFAULT_WORK_HOURS_CONFIG,
  normalizeWorkHoursConfig,
  WORK_HOURS_CONFIG_STORAGE_KEY,
  type WorkHoursConfig,
} from "../../../utils/workHoursConfig";

export const useWorkHoursConfig = () => {
  const [workHoursConfig, setWorkHoursConfig] = useState<WorkHoursConfig>(
    DEFAULT_WORK_HOURS_CONFIG,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const result = await browser.storage.local.get(
          WORK_HOURS_CONFIG_STORAGE_KEY,
        );
        const storedConfig = result[
          WORK_HOURS_CONFIG_STORAGE_KEY
        ] as Partial<WorkHoursConfig> | undefined;
        setWorkHoursConfig(normalizeWorkHoursConfig(storedConfig));
      } catch (error) {
        console.error("Error loading work hours config:", error);
        setWorkHoursConfig(DEFAULT_WORK_HOURS_CONFIG);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();

    const handleStorageChange = (
      changes: Record<string, { newValue?: unknown }>,
      areaName: string,
    ) => {
      if (areaName !== "local" || !changes[WORK_HOURS_CONFIG_STORAGE_KEY]) {
        return;
      }

      const newValue = changes[WORK_HOURS_CONFIG_STORAGE_KEY]
        .newValue as Partial<WorkHoursConfig> | undefined;
      setWorkHoursConfig(normalizeWorkHoursConfig(newValue));
    };

    browser.storage.onChanged.addListener(handleStorageChange);
    return () => {
      browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return { workHoursConfig, loading };
};
