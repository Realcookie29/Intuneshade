import { useState, useCallback } from "react";
import type { PolicyType, PolicyRow } from "../types/policyTypes";
import type { AddAssignmentFormState } from "../types/assignmentTypes";
import { addAssignment, deleteAssignment } from "../services/assignmentsService";

interface UseAssignmentsResult {
  add: (
    policyType: PolicyType,
    policyId: string,
    form: AddAssignmentFormState,
    appOdataType?: string
  ) => Promise<void>;
  remove: (policyType: PolicyType, rows: PolicyRow[]) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
  clearError: () => void;
}

export function useAssignments(): UseAssignmentsResult {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = useCallback(
    async (
      policyType: PolicyType,
      policyId: string,
      form: AddAssignmentFormState,
      appOdataType?: string
    ) => {
      setIsSubmitting(true);
      setError(null);
      try {
        await addAssignment(policyType, policyId, form, appOdataType);
      } catch (e) {
        setError((e as Error).message);
        throw e;
      } finally {
        setIsSubmitting(false);
      }
    },
    []
  );

  const remove = useCallback(async (policyType: PolicyType, rows: PolicyRow[]) => {
    setIsSubmitting(true);
    setError(null);
    try {
      for (const row of rows) {
        if (row.assignmentType === "No Assignment") continue;
        const targetOdataType =
          row.assignmentType === "All Users"
            ? "#microsoft.graph.allLicensedUsersAssignmentTarget"
            : row.assignmentType === "All Devices"
              ? "#microsoft.graph.allDevicesAssignmentTarget"
              : row.assignmentType === "Exclude"
                ? "#microsoft.graph.exclusionGroupAssignmentTarget"
                : "#microsoft.graph.groupAssignmentTarget";

        await deleteAssignment(
          policyType,
          row.policyId,
          row.groupId,
          row.assignmentId,
          targetOdataType
        );
      }
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { add, remove, isSubmitting, error, clearError };
}
