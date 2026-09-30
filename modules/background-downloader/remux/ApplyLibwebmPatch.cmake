execute_process(COMMAND git apply --recount --reverse --check "${PATCH}"
  RESULT_VARIABLE already_applied OUTPUT_QUIET ERROR_QUIET)
if(NOT already_applied EQUAL 0)
  execute_process(COMMAND git apply --recount "${PATCH}"
    RESULT_VARIABLE patch_result)
  if(NOT patch_result EQUAL 0)
    message(FATAL_ERROR "Cannot apply libwebm default-track extension")
  endif()
endif()
