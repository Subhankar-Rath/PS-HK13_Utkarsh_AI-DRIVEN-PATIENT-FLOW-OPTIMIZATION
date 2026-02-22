class PatientPriorityModel:

    @staticmethod
    def calculate_priority(age, gender, disability):

        # 1. Age Score
        if age <= 5:
            age_score = 60
        elif age <= 17:
            age_score = 40
        elif age <= 59:
            age_score = 20
        elif age <= 74:
            age_score = 50
        else:
            age_score = 60

        # 2. Disability Score
        disability_score = 30 if disability else 0

        # 3. Gender Adjustment
        gender_score = 0
        if gender.lower() == "female" and 18 <= age <= 45:
            gender_score = 10

        total_score = age_score + disability_score + gender_score

        # Priority Category
        if total_score >= 80:
            level = "EMERGENCY"
        elif total_score >= 40:
            level = "ROUTINE"
        else:
            level = "FOLLOW-UP"

        return total_score, level