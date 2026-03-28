/**
 * Update Advisor Profile DTO
 *
 * Partial version of CreateAdvisorProfileDto — all fields optional.
 */

import { PartialType } from '@nestjs/mapped-types'
import { CreateAdvisorProfileDto } from './create-advisor-profile.dto'

export class UpdateAdvisorProfileDto extends PartialType(CreateAdvisorProfileDto) {}
