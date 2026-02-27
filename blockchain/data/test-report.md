# Smart Contract Test Report

> Generated: 2026-02-27 12:11:56 UTC

## Summary

| Metric | Value |
|---|---|
| **Total Tests** | 92 |
| ✅ **Passing** | 92 |
| ❌ **Failing** | 0 |
| ⚠️ **Pending** | 0 |
| ⏭️ **Skipped** | 0 |
| **Pass Rate** | 100.0% |
| **Total Duration** | 1.07s |

## Results by Category

| Category | Pass | Fail | Total | Duration |
|---|---|---|---|---|
| ✅ Cross-Contract Integration | 10 | 0 | 10 | 0.28s |
| ✅ Security Tests | 20 | 0 | 20 | 0.28s |
| ✅ DoctorManagement | 28 | 0 | 28 | 0.18s |
| ✅ HealthcareAudit | 13 | 0 | 13 | 0.17s |
| ✅ PatientManagement | 21 | 0 | 21 | 0.16s |

---

### Cross-Contract Integration (10/10)

| # | Test | Status | Duration |
|---|---|---|---|
| 1 | should complete the patient journey end-to-end | ✅ Pass | 35ms |
| 2 | should complete the doctor journey end-to-end | ✅ Pass | 10ms |
| 3 | should complete the grant-view-revoke flow | ✅ Pass | 23ms |
| 4 | should handle patient granting access to 3 doctors then revoking 1 | ✅ Pass | 25ms |
| 5 | should correctly version documents: v1 → v2 → only v2 active | ✅ Pass | 24ms |
| 6 | should log full register → grant → revoke audit trail | ✅ Pass | 61ms |
| 7 | should allow querying audit trail by subject after mixed actions | ✅ Pass | 28ms |
| 8 | should complete register → grant → record → audit → revoke → records survive | ✅ Pass | 28ms |
| 9 | should handle revoking all doctors then re-granting one | ✅ Pass | 22ms |
| 10 | should handle complex selective revocations | ✅ Pass | 23ms |

### Security Tests (20/20)

| # | Test | Status | Duration |
|---|---|---|---|
| 1 | should prevent non-admin from registering a doctor | ✅ Pass | 26ms |
| 2 | should prevent non-admin from registering a patient | ✅ Pass | 4ms |
| 3 | should prevent doctor from registering other doctors | ✅ Pass | 6ms |
| 4 | should prevent patient from calling admin functions | ✅ Pass | 5ms |
| 5 | should prevent doctor from revoking their own patient's access | ✅ Pass | 3ms |
| 6 | should prevent stranger from revoking access | ✅ Pass | 3ms |
| 7 | should prevent admin from revoking on behalf of patient | ✅ Pass | 3ms |
| 8 | should handle empty string username and role | ✅ Pass | 10ms |
| 9 | should handle very long string input | ✅ Pass | 22ms |
| 10 | should handle special characters and unicode in strings | ✅ Pass | 9ms |
| 11 | should handle SQL injection attempts in strings (no-op on blockchain) | ✅ Pass | 6ms |
| 12 | should not allow modifying existing audit logs (append-only) | ✅ Pass | 19ms |
| 13 | should preserve audit log timestamps | ✅ Pass | 8ms |
| 14 | should preserve original record's IPFS hash after adding new records | ✅ Pass | 16ms |
| 15 | should resist reentrancy on revokePatientAccess | ✅ Pass | 21ms |
| 16 | should allow registering zero address as doctor (no guard in contract) | ✅ Pass | 9ms |
| 17 | should allow registering zero address as patient | ✅ Pass | 7ms |
| 18 | should allow same address to be registered as both doctor and patient | ✅ Pass | 17ms |
| 19 | should handle rapid successive grant/revoke operations | ✅ Pass | 31ms |
| 20 | should handle many audit log entries without failure | ✅ Pass | 56ms |

### DoctorManagement (28/28)

| # | Test | Status | Duration |
|---|---|---|---|
| 1 | should set deployer as admin | ✅ Pass | 4ms |
| 2 | should register admin as a doctor on deploy | ✅ Pass | 8ms |
| 3 | should include admin in getAllDoctors | ✅ Pass | 1ms |
| 4 | should register a doctor successfully | ✅ Pass | 8ms |
| 5 | should emit DoctorRegistered event with correct args | ✅ Pass | 22ms |
| 6 | should add doctor to getAllDoctors list | ✅ Pass | 6ms |
| 7 | should revert if non-admin tries to register | ✅ Pass | 3ms |
| 8 | should revert if doctor already registered | ✅ Pass | 4ms |
| 9 | should allow registering with empty username (edge case) | ✅ Pass | 9ms |
| 10 | should return correct doctor data | ✅ Pass | 8ms |
| 11 | should revert for unregistered doctor | ✅ Pass | 4ms |
| 12 | should grant patient access successfully | ✅ Pass | 3ms |
| 13 | should add patient to getAuthorizedPatients list | ✅ Pass | 3ms |
| 14 | should emit PatientAccessGranted event | ✅ Pass | 9ms |
| 15 | should revert for unregistered doctor | ✅ Pass | 4ms |
| 16 | should revert if access already granted (duplicate) | ✅ Pass | 5ms |
| 17 | should revoke access when called by patient | ✅ Pass | 2ms |
| 18 | should remove patient from authorized patients list | ✅ Pass | 6ms |
| 19 | should emit PatientAccessRevoked event | ✅ Pass | 10ms |
| 20 | should revert if non-patient tries to revoke | ✅ Pass | 5ms |
| 21 | should revert if admin tries to revoke | ✅ Pass | 5ms |
| 22 | should revert on double-revoke | ✅ Pass | 4ms |
| 23 | should revert for unregistered doctor | ✅ Pass | 3ms |
| 24 | should allow re-granting after revocation | ✅ Pass | 8ms |
| 25 | should allow a second revoke after re-grant | ✅ Pass | 10ms |
| 26 | should only revoke the specific patient, not others | ✅ Pass | 6ms |
| 27 | should maintain correct patients array after partial revoke | ✅ Pass | 9ms |
| 28 | should handle revoking all patients from a doctor | ✅ Pass | 8ms |

### HealthcareAudit (13/13)

| # | Test | Status | Duration |
|---|---|---|---|
| 1 | should set deployer as admin | ✅ Pass | 5ms |
| 2 | should have correct constant action type strings | ✅ Pass | 13ms |
| 3 | should start with empty audit trail | ✅ Pass | 4ms |
| 4 | should add an audit log successfully | ✅ Pass | 29ms |
| 5 | should emit AuditLogAdded event with correct args | ✅ Pass | 3ms |
| 6 | should store block.timestamp in the record | ✅ Pass | 4ms |
| 7 | should allow anyone to add audit logs (no access restriction) | ✅ Pass | 8ms |
| 8 | should allow audit log with empty string fields (edge case) | ✅ Pass | 13ms |
| 9 | should return all logs in order | ✅ Pass | 28ms |
| 10 | should filter logs by actor correctly | ✅ Pass | 25ms |
| 11 | should return empty array for actor with no logs | ✅ Pass | 11ms |
| 12 | should filter logs by subject correctly | ✅ Pass | 24ms |
| 13 | should return empty array for subject with no logs | ✅ Pass | 6ms |

### PatientManagement (21/21)

| # | Test | Status | Duration |
|---|---|---|---|
| 1 | should set deployer as admin | ✅ Pass | 12ms |
| 2 | should register admin as a patient on deploy | ✅ Pass | 8ms |
| 3 | should register a patient successfully | ✅ Pass | 9ms |
| 4 | should emit PatientRegistered event with correct args | ✅ Pass | 15ms |
| 5 | should revert if non-admin tries to register | ✅ Pass | 3ms |
| 6 | should revert if patient is already registered | ✅ Pass | 5ms |
| 7 | should allow registering with empty username (edge case) | ✅ Pass | 9ms |
| 8 | should return correct patient data | ✅ Pass | 11ms |
| 9 | should revert for unregistered patient | ✅ Pass | 5ms |
| 10 | should add a medical record successfully | ✅ Pass | 10ms |
| 11 | should emit MedicalRecordAdded event | ✅ Pass | 3ms |
| 12 | should store msg.sender as the doctor field | ✅ Pass | 8ms |
| 13 | should revert for unregistered patient | ✅ Pass | 3ms |
| 14 | should allow record with empty string fields (edge case) | ✅ Pass | 10ms |
| 15 | should add multiple records for the same patient | ✅ Pass | 11ms |
| 16 | should deactivate old record when updating with previousVersion | ✅ Pass | 6ms |
| 17 | should emit MedicalRecordUpdated event on version update | ✅ Pass | 5ms |
| 18 | getActiveRecords should only return active records after versioning | ✅ Pass | 14ms |
| 19 | should revert getMedicalRecords for unregistered patient | ✅ Pass | 3ms |
| 20 | should revert getActiveRecords for unregistered patient | ✅ Pass | 2ms |
| 21 | should return empty array when patient has no records | ✅ Pass | 7ms |

---

*Report generated by `scripts/generate-test-report.js` from mochawesome data.*